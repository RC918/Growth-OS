import {spawn} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Controller Coder adapter: one bounded `muse exec` per task through the
// verified headless entry (dedupe + hard group-kill live there). Runs only
// where headless is available (native terminal); in the sandbox it fails
// closed as BLOCKED, never as PASS.
const entry = join(dirname(fileURLToPath(import.meta.url)), 'headless-verify.mjs');
export function createHeadlessCoder({synthetic = false, timeoutMs = 120_000, state} = {}) {
  return async (task) => {
    const argv = [entry, '--task-id', `${task.id}`, '--timeout-ms', String(timeoutMs)];
    if (synthetic) argv.push('--synthetic');
    if (state) argv.push('--state', state);
    const {code, out, err} = await new Promise((resolve) => {
      const child = spawn('node', argv, {stdio: ['ignore', 'pipe', 'pipe']});
      let out = '', err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('close', (code) => resolve({code, out, err}));
    });
    let result = null;
    try { result = JSON.parse(out.trim().split('\n').at(-1)); } catch {}
    if (result?.status === 'PASS') return result;
    if (result?.status === 'TIMEOUT') throw Object.assign(new Error('headless timeout'), {code: 'TOOL_TIMEOUT'});
    if (/429|rate.?limit/i.test(err)) throw Object.assign(new Error('headless rate limited'), {code: 'RATE_LIMIT', retryAfterMs: 60_000});
    throw Object.assign(new Error(`headless blocked or failed: ${(err || out).slice(-200)}`), {code: 'BLOCKED'});
  };
}
