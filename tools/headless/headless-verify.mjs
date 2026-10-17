#!/usr/bin/env node
// Headless controlled verification entry. Run from a native Mac terminal:
//   node tools/headless/headless-verify.mjs --synthetic
// --synthetic uses the echo provider (no model call, no new API key); without
// it, muse exec uses the existing logged-in session. One read-only task only.
import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--synthetic') args.set('synthetic', true);
  else if (a.startsWith('--')) args.set(a.slice(2), process.argv[++i]);
}
const synthetic = args.get('synthetic') === true;
const taskId = String(args.get('task-id') ?? 'headless-readonly-001');
const timeoutMs = Math.min(Number(args.get('timeout-ms') ?? 120_000), 300_000); // hard cap, max 5 min
const museBin = process.env.MUSE_BIN || 'muse';
const statePath = args.get('state') ?? join(dirname(fileURLToPath(import.meta.url)), 'checkpoint.json');
const prompt = 'Reply with exactly HEADLESS_OK. Do not use any tools, do not read or write files.';

async function load() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {tasks: {}}; throw e; }
}
async function save(state) {
  await mkdir(dirname(statePath), {recursive: true});
  const tmp = `${statePath}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, statePath); // atomic checkpoint
}

const state = await load();
const prior = state.tasks[taskId];
if (prior?.status === 'PASS') { // dedupe: never call the model twice for one task
  console.log(JSON.stringify({taskId, status: 'PASS', deduped: true, exitCode: prior.exitCode, elapsedMs: prior.elapsedMs}));
  process.exit(0);
}

const started = Date.now();
const child = spawn(museBin, ['exec', '--provider', synthetic ? 'echo' : 'meta', prompt], {detached: true, stdio: ['ignore', 'pipe', 'pipe']});
let out = '', err = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { err += d; });
let timedOut = false;
const killer = setTimeout(() => {
  timedOut = true;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } // kills the whole process group
}, timeoutMs);
const exitCode = await new Promise((resolve) => child.on('close', resolve));
clearTimeout(killer);
const elapsedMs = Date.now() - started;
let childGone = false;
try { process.kill(child.pid, 0); } catch { childGone = true; } // true only when the process really exited
const status = timedOut ? 'TIMEOUT' : exitCode === 0 ? 'PASS' : 'FAIL';
state.tasks[taskId] = {status, exitCode: timedOut ? null : exitCode, elapsedMs, synthetic, at: new Date().toISOString(), outputTail: out.slice(-500), errorTail: err.slice(-500)};
await save(state);
console.log(JSON.stringify({taskId, status, exitCode: state.tasks[taskId].exitCode, elapsedMs, childGone, synthetic}));
process.exit(timedOut || exitCode !== 0 ? 1 : 0);
