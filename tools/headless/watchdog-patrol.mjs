#!/usr/bin/env node
// Controlled Watchdog patrol for the Owner-approved 24h trial (native Mac
// terminal only). Lightweight read-only patrol every 10 minutes; models are
// called only through the Controller when a checkpointed task can safely
// advance. Hard expiry, single instance, JSONL audit log, explicit stop by
// expiry or SIGINT/SIGTERM. Never pushes, merges, deploys, or schedules itself.
import {appendFile, mkdir, open, readFile, unlink} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Controller} from '../controller/controller.mjs';
import {Watchdog, PATROL_INTERVAL_MS} from '../controller/watchdog.mjs';
import {createHeadlessCoder} from './headless-adapter.mjs';

const argv = process.argv.slice(2);
const get = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const synthetic = argv.includes('--synthetic');
const MIN_INTERVAL_MS = PATROL_INTERVAL_MS; // 600000: formal patrol never faster than 10 minutes
const MAX_DURATION_MS = 24 * 3600_000; // 86400000: trial never longer than 24 hours
function timeArg(name, raw, {min, max}) {
  const n = Number(raw);
  if (raw === undefined || !Number.isFinite(n) || n <= 0 || n < min || n > max) {
    console.log(JSON.stringify({event: 'patrol:blocked', reason: `invalid ${name}: ${raw}`}));
    process.exit(2); // NaN, zero, negative, too short, and too long are all refused
  }
  return n;
}
const intervalMs = timeArg('--interval-ms', get('--interval-ms', MIN_INTERVAL_MS), {min: synthetic ? 1 : MIN_INTERVAL_MS, max: MIN_INTERVAL_MS});
const durationMs = timeArg('--duration-ms', get('--duration-ms', MAX_DURATION_MS), {min: 1, max: MAX_DURATION_MS});
const dir = get('--state-dir', join(dirname(fileURLToPath(import.meta.url)), '.watchdog-state'));
const logPath = join(dir, 'patrol-log.jsonl');
const lockPath = join(dir, 'patrol.lock');
const runId = randomUUID();
await mkdir(dir, {recursive: true});
const lockFh = await open(lockPath, 'wx').catch(() => null);
if (!lockFh) { console.log(JSON.stringify({event: 'patrol:blocked', reason: 'single-instance lock held'})); process.exit(2); }
await lockFh.writeFile(JSON.stringify({runId, pid: process.pid, at: Date.now()}));
const log = async (event, extra = {}) => { const row = {at: new Date().toISOString(), runId, event, ...extra}; await appendFile(logPath, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)); };
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; });
const controller = new Controller({
  dir, sessionId: 'controller-session',
  tools: {
    plan: async () => {},
    code: createHeadlessCoder({synthetic, timeoutMs: 120_000, state: join(dir, 'headless-checkpoint.json')}),
    test: async () => 'PASS', build: async () => 'PASS', e2e: async () => 'PASS',
    review: async () => { throw Object.assign(new Error('awaiting independent reviewer'), {code: 'REVIEW_PENDING'}); }, // never self-approve
    preview: async () => 'PASS',
    gitHead: async () => 'controlled-trial', gitClean: async () => true,
    isAlive: async (h) => { try { process.kill(h.pid, 0); return true; } catch { return false; } },
  },
});
// Fail-closed deadline: only a truly missing file (ENOENT) may create the
// first deadline, atomically. Corruption, permission errors, or illegal or
// missing fields stop the patrol; the original deadline is never extended.
const deadlinePath = join(dir, 'patrol-deadline.json');
let stopAt, trialId;
{
  let raw = null;
  try { raw = await readFile(deadlinePath, 'utf8'); }
  catch (e) {
    if (e.code !== 'ENOENT') { console.log(JSON.stringify({event: 'patrol:blocked', reason: `deadline unreadable: ${e.code}`})); process.exit(2); }
  }
  if (raw === null) {
    trialId = `trial-${randomUUID()}`;
    stopAt = Date.now() + durationMs;
    const tmp = `${deadlinePath}.${randomUUID()}.tmp`;
    const {writeFile: wf, rename: rn} = await import('node:fs/promises');
    await wf(tmp, JSON.stringify({stopAt, firstStartAt: Date.now(), trialId}) + '\n');
    await rn(tmp, deadlinePath); // atomic, recoverable save
  } else {
    let saved = null;
    try { saved = JSON.parse(raw); } catch {}
    if (!saved || !Number.isFinite(saved.stopAt) || saved.stopAt <= 0 || typeof saved.trialId !== 'string' || !saved.trialId) {
      console.log(JSON.stringify({event: 'patrol:blocked', reason: 'deadline corrupt or illegal'}));
      await lockFh.close().catch(() => {}); await unlink(lockPath).catch(() => {});
      process.exit(2);
    }
    stopAt = saved.stopAt; trialId = saved.trialId;
  }
}
// Strict allowlist: only tasks explicitly registered for THIS trial, with a
// matching read-only/synthetic mode and resume scope, may advance. Anything
// missing, unknown, forged, or from another trial is supervised only.
let allowlist = {trialId: null, tasks: []};
try {
  const parsed = JSON.parse(await readFile(join(dir, 'patrol-allowlist.json'), 'utf8'));
  if (parsed && Array.isArray(parsed.tasks)) allowlist = parsed;
} catch (e) { if (e.code !== 'ENOENT') { console.log(JSON.stringify({event: 'patrol:blocked', reason: 'allowlist corrupt'})); process.exit(2); } }
const authorized = (task) => {
  if (allowlist.trialId !== trialId) return false;
  const entry = allowlist.tasks.find((t) => t.id === task.id);
  return !!entry && entry.mode === task.payload?.mode && ['real-readonly', 'synthetic'].includes(entry.mode)
    && Array.isArray(entry.scopes) && entry.scopes.includes('resume-readonly');
};
const watchdog = new Watchdog({controller, inspect: {isRunning: async (task) => !authorized(task)}, notify: async (major) => log('patrol:notify-owner', {major})});
await log('patrol:start', {intervalMs, durationMs, synthetic});
try {
  while (!stopping && Date.now() < stopAt) { // bounded loop: expiry or signal, never permanent
    const started = Date.now();
    try { const actions = await watchdog.tick('patrol'); await log('patrol:tick', {actions, elapsedMs: Date.now() - started}); }
    catch (e) { await log('patrol:error', {code: e.code ?? 'FAIL'}); if (e.code === 'CHECKPOINT_CORRUPT') break; } // no infinite restart on failure
    const wait = Math.min(intervalMs, Math.max(0, stopAt - Date.now()));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
} finally {
  await log('patrol:stop', {reason: stopping ? 'signal' : 'expired-24h'});
  await lockFh.close().catch(() => {});
  let cur = null; try { cur = JSON.parse(await readFile(lockPath, 'utf8')); } catch {}
  if (cur?.runId === runId) await unlink(lockPath).catch(() => {});
}
