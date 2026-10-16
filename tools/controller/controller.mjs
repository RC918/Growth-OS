import {mkdir, readFile, writeFile, rename, open, stat, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export const STATUSES = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'REVIEW_BLOCKED', 'REVIEW_PASS'];
export const STAGES = ['code', 'test', 'ci', 'review'];
const MAX_ATTEMPTS = 2;
const LOCK_STALE_MS = 60_000;

export class CheckpointCorrupt extends Error { constructor(m) { super(m); this.code = 'CHECKPOINT_CORRUPT'; } }

// Hardened controller: stages are independently recoverable, checkpoints are
// written atomically, a corrupt checkpoint stops the run (never overwritten),
// locks expire, and a review verdict is bound to the exact commit SHA.
export class Controller {
  constructor({dir, tools, sessionId = 'coder-session', now = Date.now}) {
    this.dir = dir; this.tools = tools; this.sessionId = sessionId; this.now = now;
    this.statePath = join(dir, 'state.json'); this.lockPath = join(dir, 'controller.lock');
  }
  async #load() {
    let raw;
    try { raw = await readFile(this.statePath, 'utf8'); }
    catch (e) {
      if (e.code === 'ENOENT') return {tasks: {}};
      throw e; // permission and other IO errors are not "empty state"
    }
    try { const s = JSON.parse(raw); if (!s || typeof s.tasks !== 'object') throw new Error('shape'); return s; }
    catch { throw new CheckpointCorrupt('state.json is corrupt; refusing to overwrite'); }
  }
  async #save(state) {
    const tmp = join(this.dir, `state.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
    await rename(tmp, this.statePath); // atomic replace on the same filesystem
  }
  async #lock() {
    await mkdir(this.dir, {recursive: true});
    for (let i = 0; i < 2; i++) {
      const fh = await open(this.lockPath, 'wx').catch((e) => { if (e.code === 'EEXIST') return null; throw e; });
      if (fh) { await fh.writeFile(JSON.stringify({session: this.sessionId, at: this.now()})); return fh; }
      const st = await stat(this.lockPath).catch(() => null);
      if (st && this.now() - st.mtimeMs > LOCK_STALE_MS) { await unlink(this.lockPath).catch(() => {}); continue; }
      const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e;
    }
    const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e;
  }
  async #unlock(fh) { await fh?.close().catch(() => {}); await unlink(this.lockPath).catch(() => {}); }

  async run({id, commit, payload}) {
    const lock = await this.#lock();
    try {
      const state = await this.#load(); // corrupt checkpoint throws here, state untouched
      const key = `${id}@${commit}`;
      const task = state.tasks[key] ?? {id, commit, status: 'PENDING', attempts: 0, stages: {}, log: []};
      state.tasks[key] = task;
      // A review verdict only ever applies to its own commit: other commits are
      // separate keys, and a stored verdict for this key is rechecked below.
      if (task.stages.review?.verdictCommit !== commit) delete task.stages.review;
      await this.#save(state);
      for (const stage of STAGES) {
        if (task.stages[stage]?.status === 'PASS') continue; // resume from last success
        if (task.attempts >= MAX_ATTEMPTS && stage === 'code') break;
        try {
          if (stage === 'code') {
            for (;;) { // bounded 429 retry on the code stage only
              try { task.attempts++; await this.tools.code(task, payload); break; }
              catch (e) { if (e.code !== 'RATE_LIMIT' || task.attempts >= MAX_ATTEMPTS) throw e; task.log.push('code: 429'); await this.#save(state); }
            }
            task.stages.code = {status: 'PASS', commit};
          }
          if (stage === 'test') { const r = await this.tools.test(task); task.stages.test = {status: r, commit}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'ci') { const r = await this.tools.ci(task); task.stages.ci = {status: r, commit}; if (r !== 'PASS') { task.status = r; break; } } // PENDING recorded, never loops
          if (stage === 'review') {
            const v = await this.tools.review(task);
            const valid = v && v.verdict === 'APPROVE' && v.commit === commit && v.completed === true && v.sessionId && v.sessionId !== this.sessionId;
            task.stages.review = {status: valid ? 'PASS' : 'REVIEW_BLOCKED', verdictCommit: v?.commit ?? null};
            task.status = valid ? 'REVIEW_PASS' : 'REVIEW_BLOCKED';
          }
          await this.#save(state);
        } catch (e) {
          task.log.push(`${stage}: ${e.code === 'RATE_LIMIT' ? '429' : e.code || 'FAIL'}`);
          task.stages[stage] = {status: e.code === 'LOCKED' ? 'BLOCKED' : 'FAIL', commit};
          task.status = task.stages[stage].status;
          await this.#save(state);
          if (e.code === 'RATE_LIMIT' && stage === 'code' && task.attempts < MAX_ATTEMPTS) continue;
          break;
        }
      }
      if (task.stages.review?.status === 'PASS' && task.stages.ci?.status === 'PASS') task.status = 'REVIEW_PASS';
      else if (task.status === 'PENDING' && task.stages.code?.status === 'PASS') task.status = task.stages.review?.status ?? 'PENDING';
      await this.#save(state);
      return task;
    } finally { await this.#unlock(lock); }
  }
}
