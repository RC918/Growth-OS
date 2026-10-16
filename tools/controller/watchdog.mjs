// Supervision Loop: lightweight patrol every 10 minutes plus event-driven
// ticks. A patrol only inspects checkpoints, HEAD, CI, review, lock, and 429
// state; it never calls a model unless exactly one safely-resumable task
// exists, never overlaps a second Primary Coder, and never restarts a task
// that is still running. Scheduling stays disabled until Owner approval.
export const PATROL_INTERVAL_MS = 10 * 60_000;

export class Watchdog {
  constructor({controller, inspect, notify}) { this.controller = controller; this.inspect = inspect; this.notify = notify; this.ticking = false; }
  async tick(reason = 'patrol') {
    if (this.ticking) return [{action: 'skip-overlap'}]; // one patrol at a time
    this.ticking = true;
    try {
      const state = await this.controller.loadState();
      const actions = [];
      let dispatched = 0; // at most one Primary Coder dispatch per tick
      for (const task of Object.values(state.tasks)) {
        const head = this.inspect?.gitHead ? await this.inspect.gitHead(task) : null;
        if (head && task.outputSha && head !== task.outputSha) { actions.push({task: task.id, action: 'stale-evidence', head}); continue; }
        const now = this.controller.now ? this.controller.now() : Date.now();
        if (task.status === 'WAITING' && task.waitUntil && task.waitUntil > now) { actions.push({task: task.id, action: 'wait-429'}); continue; }
        if (['BLOCKED', 'REVIEW_BLOCKED', 'FAIL', 'REVIEW_PASS', 'PASS'].includes(task.status)) {
          if (task.status !== 'REVIEW_PASS' && task.status !== 'PASS') actions.push({task: task.id, action: 'bypass-blocked'});
          continue;
        }
        const running = this.inspect?.isRunning ? await this.inspect.isRunning(task) : false;
        if (running) { actions.push({task: task.id, action: 'supervise-only'}); continue; } // long task: watch, never restart
        if ((task.status === 'PENDING' || task.status === 'WAITING') && dispatched === 0) {
          dispatched++;
          await this.controller.run({id: task.id, commit: task.commit}); // checkpointed resume; finished stages never redo
          actions.push({task: task.id, action: 'resumed', reason});
        } else if (task.status === 'PENDING' || task.status === 'WAITING') {
          actions.push({task: task.id, action: 'defer-single-coder'});
        }
      }
      const major = actions.filter((a) => a.action === 'stale-evidence');
      if (major.length && this.notify) await this.notify(major);
      return actions;
    } finally { this.ticking = false; }
  }
  // CI completion, reviewer verdicts, and task completion fire this
  // immediately instead of waiting for the next 10-minute patrol.
  async onEvent(event) { return this.tick(`event:${event?.type ?? 'github'}`); }
}
