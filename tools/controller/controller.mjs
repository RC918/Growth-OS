import {mkdir, readFile, writeFile, open} from 'node:fs/promises';
import {join} from 'node:path';

export const STATUSES = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'REVIEW_BLOCKED', 'REVIEW_PASS'];
const MAX_ATTEMPTS = 2; // authorized retry limit, never unlimited

// Minimal executable engineering controller prototype.
// State is a single JSON checkpoint file; every transition is persisted before
// the next step so a 429 / interruption / restart resumes instead of redoing.
// Tools (coder/test/ci/reviewer) are injected, which keeps this runnable with
// synthetic tasks and lets production adapters stay behind approval gates.
export class Controller {
  constructor({dir, tools}) {
    this.dir = dir; this.tools = tools;
    this.statePath = join(dir, 'state.json'); this.lockPath = join(dir, 'controller.lock');
  }
  async #load() {
    try { return JSON.parse(await readFile(this.statePath, 'utf8')); }
    catch { return {tasks: {}}; }
  }
  async #save(state) {
    await mkdir(this.dir, {recursive: true});
    await writeFile(this.statePath, JSON.stringify(state, null, 2) + '\n');
  }
  async #lock() {
    const fh = await open(this.lockPath, 'wx').catch(() => null);
    if (!fh) { const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e; }
    return fh;
  }
  // Returns the recorded task when the id+commit was already finished (dedupe).
  async run({id, commit, payload}) {
    const lock = await this.#lock();
    try {
      const state = await this.#load();
      const key = `${id}@${commit}`;
      const prior = state.tasks[key];
      if (prior && ['PASS', 'REVIEW_PASS'].includes(prior.status)) return {...prior, deduped: true};
      const task = prior ?? {id, commit, status: 'PENDING', attempts: 0, log: []};
      state.tasks[key] = task; await this.#save(state);
      while (task.attempts < MAX_ATTEMPTS) {
        task.attempts++;
        try {
          await this.tools.code(task, payload);
          const test = await this.tools.test(task);
          task.status = test === 'PENDING' ? 'PENDING' : test; // CI pending never blocks the loop
          task.log.push(`attempt ${task.attempts}: test=${test}`);
          await this.#save(state);
          if (task.status !== 'PASS') break;
          const verdict = await this.tools.review(task).catch(() => 'REVIEW_BLOCKED');
          task.status = verdict === 'APPROVE' ? 'REVIEW_PASS' : 'REVIEW_BLOCKED'; // only reviewer may pass review
          task.log.push(`attempt ${task.attempts}: review=${verdict}`);
          await this.#save(state); break;
        } catch (e) {
          task.log.push(`attempt ${task.attempts}: ${e.code === 'RATE_LIMIT' ? '429' : 'FAIL'} ${e.message}`);
          task.status = e.code === 'LOCKED' ? 'BLOCKED' : 'FAIL';
          await this.#save(state); // checkpoint before any retry or stop
          if (e.code !== 'RATE_LIMIT') break;
        }
      }
      if (task.attempts >= MAX_ATTEMPTS && task.status === 'FAIL') task.log.push('retry limit reached');
      await this.#save(state);
      return task;
    } finally { await lock.close().catch(() => {}); const {unlink} = await import('node:fs/promises'); await unlink(this.lockPath).catch(() => {}); }
  }
}
