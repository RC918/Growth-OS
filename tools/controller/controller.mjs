import {mkdir, readFile, writeFile, rename, open, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export const STATUSES = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'REVIEW_BLOCKED', 'REVIEW_PASS', 'WAITING'];
export const STAGES = ['code', 'test', 'ci', 'review'];
const MAX_ATTEMPTS = 2;
const LEASE_MS = 30_000;

export class CheckpointCorrupt extends Error { constructor(m) { super(m); this.code = 'CHECKPOINT_CORRUPT'; } }
export const parseRetryAfter = (e, now) => {
  if (Number.isFinite(e?.retryAfterMs)) return now + e.retryAfterMs;
  if (Number.isFinite(e?.resetAt)) return e.resetAt;
  const s = Number(e?.headers?.['retry-after']); return Number.isFinite(s) ? now + s * 1000 : now + 60_000;
};

// Final-hardened controller: leased lock with heartbeat and owner-checked
// reclaim, persisted 429 wait state, and commit-bound stage evidence.
export class Controller {
  constructor({dir, tools, sessionId = 'coder-session', ownerId = 'owner', pid = process.pid, runId = randomUUID(), now = Date.now, heartbeatMs = 5_000}) {
    Object.assign(this, {dir, tools, sessionId, ownerId, pid, runId, now, heartbeatMs});
    this.statePath = join(dir, 'state.json'); this.lockPath = join(dir, 'controller.lock');
  }
  async #load() {
    let raw;
    try { raw = await readFile(this.statePath, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return {tasks: {}}; throw e; }
    try { const s = JSON.parse(raw); if (!s || typeof s.tasks !== 'object') throw new Error('shape'); return s; }
    catch { throw new CheckpointCorrupt('state.json is corrupt; refusing to overwrite'); }
  }
  async #save(state) {
    const tmp = join(this.dir, `state.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
    await rename(tmp, this.statePath);
  }
  async #lock() {
    await mkdir(this.dir, {recursive: true});
    for (let i = 0; i < 2; i++) {
      const fh = await open(this.lockPath, 'wx').catch((e) => { if (e.code === 'EEXIST') return null; throw e; });
      if (fh) {
        const lease = {ownerId: this.ownerId, pid: this.pid, runId: this.runId, session: this.sessionId, expiresAt: this.now() + LEASE_MS};
        await fh.writeFile(JSON.stringify(lease));
        this.lease = lease;
        this.timer = setInterval(() => this.#beat().catch(() => {}), this.heartbeatMs); this.timer.unref?.();
        return fh;
      }
      let holder = null;
      try { holder = JSON.parse(await readFile(this.lockPath, 'utf8')); } catch {}
      const expired = !holder || !Number.isFinite(holder.expiresAt) || holder.expiresAt <= this.now();
      const alive = holder && this.tools.isAlive ? await this.tools.isAlive(holder) : false;
      if (expired && !alive) { await unlink(this.lockPath).catch(() => {}); continue; } // reclaim only a dead, expired holder
      const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e;
    }
    const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e;
  }
  async #beat() {
    if (!this.lease) return;
    this.lease = {...this.lease, expiresAt: this.now() + LEASE_MS};
    const fh = await open(this.lockPath, 'r+').catch(() => null); if (!fh) return;
    try { const cur = JSON.parse(await fh.readFile('utf8').catch(() => '{}')); if (cur.runId !== this.runId) return; await fh.truncate(0); await fh.writeFile(JSON.stringify(this.lease), 0); } finally { await fh.close().catch(() => {}); }
  }
  async #unlock(fh) {
    clearInterval(this.timer); await fh?.close().catch(() => {});
    let cur = null; try { cur = JSON.parse(await readFile(this.lockPath, 'utf8')); } catch {}
    if (cur?.runId === this.runId) await unlink(this.lockPath).catch(() => {}); // never delete a successor's lock
  }

  async run({id, commit, payload}) {
    const fh = await this.#lock();
    try {
      const state = await this.#load();
      const key = `${id}@${commit}`;
      const task = state.tasks[key] ?? {id, commit, status: 'PENDING', attempts: 0, stages: {}, log: []};
      state.tasks[key] = task;
      if (task.waitUntil && task.waitUntil > this.now()) { task.status = 'WAITING'; await this.#save(state); return task; } // watchdog gate: no model call before due
      if (task.stages.review?.verdictCommit !== commit) delete task.stages.review;
      await this.#save(state);
      let sha = commit;
      for (const stage of STAGES) {
        if (task.stages[stage]?.status === 'PASS' && task.stages[stage].commit === sha) continue;
        try {
          if (stage === 'code') {
            task.attempts++;
            await this.tools.code(task, payload);
            sha = this.tools.gitHead ? await this.tools.gitHead() : commit; // actual output HEAD
            const clean = this.tools.gitClean ? await this.tools.gitClean() : true;
            task.outputSha = sha; task.stages.code = {status: 'PASS', commit: sha, clean};
            if (sha !== commit) { delete task.stages.test; delete task.stages.ci; delete task.stages.review; task.log.push(`code: new commit ${sha} invalidates prior evidence`); }
          }
          if (stage === 'test') { const r = await this.tools.test(task); task.stages.test = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'ci') { const r = await this.tools.ci(task); task.stages.ci = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'review') {
            const v = await this.tools.review(task);
            const valid = v?.verdict === 'APPROVE' && v.commit === sha && v.completed === true && v.source === 'independent-reviewer' && v.sessionId && v.sessionId !== this.sessionId;
            task.stages.review = {status: valid ? 'PASS' : 'REVIEW_BLOCKED', verdictCommit: v?.commit ?? null, commit: sha};
            task.status = valid ? 'REVIEW_PASS' : 'REVIEW_BLOCKED';
          }
          await this.#save(state);
        } catch (e) {
          if (e.code === 'RATE_LIMIT') {
            task.waitUntil = parseRetryAfter(e, this.now()); task.status = 'WAITING';
            task.log.push(`${stage}: 429 waitUntil=${new Date(task.waitUntil).toISOString()}`);
            await this.#save(state); break; // persisted wait; watchdog resumes after due
          }
          task.log.push(`${stage}: ${e.code || 'FAIL'}`);
          task.stages[stage] = {status: e.code === 'LOCKED' ? 'BLOCKED' : 'FAIL', commit: sha};
          task.status = task.stages[stage].status; await this.#save(state); break;
        }
      }
      if (task.stages.review?.status === 'PASS' && task.stages.ci?.status === 'PASS') task.status = 'REVIEW_PASS';
      await this.#save(state);
      return task;
    } finally { await this.#unlock(fh); }
  }
}
