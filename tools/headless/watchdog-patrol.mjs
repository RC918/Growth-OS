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
const intervalMs = Math.min(Number(get('--interval-ms', PATROL_INTERVAL_MS)), PATROL_INTERVAL_MS); // never faster than approved 10m in real mode
const durationMs = Number(get('--duration-ms', 24 * 3600_000)); // trial hard expiry: 24h
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
const watchdog = new Watchdog({controller, inspect: {}, notify: async (major) => log('patrol:notify-owner', {major})});
const stopAt = Date.now() + durationMs;
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
