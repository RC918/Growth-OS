import {mkdir, readFile, writeFile, rename, open, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export const STATUSES = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'REVIEW_BLOCKED', 'REVIEW_PASS', 'WAITING'];
// Execution Loop v2 stages; db-auth/preview may be marked not-applicable by tools.
export const STAGES = ['plan', 'code', 'test', 'build', 'e2e', 'dbauth', 'review', 'preview', 'verify'];
const MAX_ATTEMPTS = 2;
const LEASE_MS = 30_000;
const RUN_BUDGET_MS = 60 * 60_000; // hard per-run ceiling, never an unbounded loop

export class CheckpointCorrupt extends Error { constructor(m) { super(m); this.code = 'CHECKPOINT_CORRUPT'; } }
export const parseRetryAfter = (e, now) => {
  if (Number.isFinite(e?.retryAfterMs)) return now + e.retryAfterMs;
  if (Number.isFinite(e?.resetAt)) return e.resetAt;
  const s = Number(e?.headers?.['retry-after']); return Number.isFinite(s) ? now + s * 1000 : now + 60_000;
};

export class Controller {
  constructor({dir, tools, sessionId = 'coder-session', ownerId = 'owner', pid = process.pid, runId = randomUUID(), now = Date.now, heartbeatMs = 5_000, toolTimeoutMs = 600_000}) {
    Object.assign(this, {dir, tools, sessionId, ownerId, pid, runId, now, heartbeatMs, toolTimeoutMs});
    this.statePath = join(dir, 'state.json'); this.lockPath = join(dir, 'controller.lock');
  }
  async loadState() {
    let raw;
    try { raw = await readFile(this.statePath, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return {tasks: {}, audit: []}; throw e; }
    try { const s = JSON.parse(raw); if (!s || typeof s.tasks !== 'object') throw new Error('shape'); s.audit ??= []; return s; }
    catch { throw new CheckpointCorrupt('state.json is corrupt; refusing to overwrite'); }
  }
  async #save(state) {
    const tmp = join(this.dir, `state.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
    await rename(tmp, this.statePath); // atomic replace
  }
  #audit(state, task, event) { state.audit.push({at: this.now(), runId: this.runId, task: task?.id ?? null, commit: task?.outputSha ?? task?.commit ?? null, event}); }
  // Every real tool call is bounded; a hung tool fails as TOOL_TIMEOUT, never hangs the loop.
  async #tool(name, fn) {
    let timer;
    try { return await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`${name} timeout`), {code: 'TOOL_TIMEOUT'})), this.toolTimeoutMs); })]); }
    finally { clearTimeout(timer); }
  }
  async #lock() {
    await mkdir(this.dir, {recursive: true});
    for (let i = 0; i < 2; i++) {
      const fh = await open(this.lockPath, 'wx').catch((e) => { if (e.code === 'EEXIST') return null; throw e; });
      if (fh) {
        this.lease = {ownerId: this.ownerId, pid: this.pid, runId: this.runId, session: this.sessionId, expiresAt: this.now() + LEASE_MS};
        await fh.writeFile(JSON.stringify(this.lease));
        this.timer = setInterval(() => this.#beat().catch(() => {}), this.heartbeatMs); this.timer.unref?.();
        return fh;
      }
      let holder = null; try { holder = JSON.parse(await readFile(this.lockPath, 'utf8')); } catch {}
      const expired = !holder || !Number.isFinite(holder.expiresAt) || holder.expiresAt <= this.now();
      const alive = holder && this.tools.isAlive ? await this.tools.isAlive(holder) : false;
      if (expired && !alive) { await unlink(this.lockPath).catch(() => {}); continue; }
      const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e;
    }
    const e = new Error('LOCKED'); e.code = 'LOCKED'; throw e;
  }
  async #beat() {
    if (!this.lease) return;
    this.lease = {...this.lease, expiresAt: this.now() + LEASE_MS};
    const fh = await open(this.lockPath, 'r+').catch(() => null); if (!fh) return;
    try { const cur = JSON.parse(await fh.readFile({encoding: 'utf8'}).catch(() => '{}')); if (cur.runId !== this.runId) return; await fh.truncate(0); await fh.write(JSON.stringify(this.lease), 0, 'utf8'); } finally { await fh.close().catch(() => {}); }
  }
  async #unlock(fh) {
    clearInterval(this.timer); await fh?.close().catch(() => {});
    let cur = null; try { cur = JSON.parse(await readFile(this.lockPath, 'utf8')); } catch {}
    if (cur?.runId === this.runId) await unlink(this.lockPath).catch(() => {});
  }

  // One bounded pass over a single task. Finished stages are never redone;
  // PENDING resumes at ci/preview only, REVIEW_BLOCKED at review only.
  async run({id, commit, payload}) {
    const started = this.now();
    const fh = await this.#lock();
    try {
      const state = await this.loadState();
      const key = `${id}@${commit}`;
      const task = state.tasks[key] ?? {id, commit, status: 'PENDING', attempts: 0, reviewAttempts: 0, stages: {}, log: []};
      state.tasks[key] = task;
      if (payload !== undefined) task.payload = payload; // persisted for resume
      payload ??= task.payload; // recovered payload after interruption/restart
      this.#audit(state, task, 'run:start');
      if (task.waitUntil && task.waitUntil > this.now()) { task.status = 'WAITING'; this.#audit(state, task, 'wait:429-not-due'); await this.#save(state); return task; }
      if (task.stages.review?.verdictCommit !== commit) delete task.stages.review;
      let sha = task.outputSha ?? commit;
      for (const stage of STAGES) {
        if (this.now() - started > RUN_BUDGET_MS) { task.status = 'BLOCKED'; task.log.push('run budget exceeded'); break; }
        if (task.stages[stage]?.status === 'PASS' && task.stages[stage].commit === sha) continue;
        if (stage === 'review' && task.reviewAttempts >= MAX_ATTEMPTS && task.stages.review?.status === 'REVIEW_BLOCKED') { task.status = 'REVIEW_BLOCKED'; break; }
        try {
          if (stage === 'plan') { await this.#tool('plan', () => this.tools.plan?.(task, payload)); task.stages.plan = {status: 'PASS', commit: sha}; }
          if (stage === 'code') {
            task.attempts++; await this.#tool('code', () => this.tools.code(task, payload));
            sha = this.tools.gitHead ? await this.tools.gitHead() : commit;
            task.outputSha = sha; task.clean = this.tools.gitClean ? await this.tools.gitClean() : true;
            task.stages.code = {status: 'PASS', commit: sha};
            if (sha !== commit) { for (const s of STAGES.slice(2)) delete task.stages[s]; task.log.push(`code: new commit ${sha} invalidates prior evidence`); }
          }
          if (stage === 'test') { const r = await this.#tool('test', () => this.tools.test(task)); task.stages.test = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'build') { const r = await this.#tool('build', () => this.tools.build(task)); task.stages.build = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'e2e') { const r = await this.#tool('e2e', () => this.tools.e2e(task)); task.stages.e2e = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'dbauth') { const r = this.tools.dbauth ? await this.#tool('dbauth', () => this.tools.dbauth(task)) : 'PASS'; task.stages.dbauth = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'review') {
            task.reviewAttempts++;
            const v = await this.#tool('review', () => this.tools.review(task)).catch(() => null);
            const valid = v?.verdict === 'APPROVE' && v.commit === sha && v.completed === true && v.source === 'independent-reviewer' && v.sessionId && v.sessionId !== this.sessionId;
            task.stages.review = {status: valid ? 'PASS' : 'REVIEW_BLOCKED', verdictCommit: v?.commit ?? null, commit: sha};
            task.status = valid ? 'REVIEW_PASS' : 'REVIEW_BLOCKED';
          }
          if (stage === 'preview') { const r = this.tools.preview ? await this.#tool('preview', () => this.tools.preview(task)) : 'PASS'; task.stages.preview = {status: r, commit: sha}; if (r !== 'PASS') { task.status = r; break; } }
          if (stage === 'verify') { const okAll = ['test', 'build', 'e2e', 'review', 'preview'].every((s) => task.stages[s]?.status === 'PASS'); task.stages.verify = {status: okAll ? 'PASS' : 'BLOCKED', commit: sha}; }
          this.#audit(state, task, `stage:${stage}=${task.stages[stage]?.status}`);
          await this.#save(state);
        } catch (e) {
          if (e.code === 'RATE_LIMIT') { task.waitUntil = parseRetryAfter(e, this.now()); task.status = 'WAITING'; task.log.push(`${stage}: 429 waitUntil=${new Date(task.waitUntil).toISOString()}`); this.#audit(state, task, 'wait:429'); await this.#save(state); break; }
          task.log.push(`${stage}: ${e.code || 'FAIL'}`);
          task.stages[stage] = {status: e.code === 'LOCKED' ? 'BLOCKED' : 'FAIL', commit: sha};
          task.status = task.stages[stage].status; this.#audit(state, task, `stage:${stage}=${task.status}`);
          await this.#save(state); break;
        }
      }
      if (STAGES.every((s) => task.stages[s]?.status === 'PASS')) task.status = 'REVIEW_PASS';
      this.#audit(state, task, `run:end=${task.status}`);
      await this.#save(state);
      return task;
    } finally { await this.#unlock(fh); }
  }
}
