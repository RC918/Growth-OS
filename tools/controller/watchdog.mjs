// Supervision Loop prototype: a single tick (normally every 20 minutes, or
// immediately on a GitHub event) inspects state without polling. It resumes
// only safely-resumable tasks, bypasses BLOCKED ones, and escalates solely
// on major decisions. Scheduling itself stays disabled until Owner approval.
export class Watchdog {
  constructor({controller, inspect, notify}) { this.controller = controller; this.inspect = inspect; this.notify = notify; }
  async tick(reason = 'schedule') {
    const state = await this.controller.loadState();
    const actions = [];
    for (const task of Object.values(state.tasks)) {
      const head = this.inspect?.gitHead ? await this.inspect.gitHead(task) : null;
      if (head && task.outputSha && head !== task.outputSha) { actions.push({task: task.id, action: 'stale-evidence', head}); continue; }
      const now = this.controller.now ? this.controller.now() : Date.now();
      if (task.status === 'WAITING' && task.waitUntil && task.waitUntil > now) { actions.push({task: task.id, action: 'wait-429'}); continue; }
      if (['BLOCKED', 'REVIEW_BLOCKED', 'FAIL'].includes(task.status)) { actions.push({task: task.id, action: 'bypass-blocked'}); continue; } // other tasks still run
      if (task.status === 'PENDING' || task.status === 'WAITING') {
        await this.controller.run({id: task.id, commit: task.commit}); // resumes at unfinished stage only
        actions.push({task: task.id, action: 'resumed', reason});
      }
    }
    const major = actions.filter((a) => a.action === 'stale-evidence');
    if (major.length && this.notify) await this.notify(major); // Owner only for major decisions
    return actions;
  }
  // GitHub events (push / checks completed / review submitted) trigger the
  // same tick immediately instead of waiting for the next 20-minute cycle.
  async onEvent(event) { return this.tick(`event:${event?.type ?? 'github'}`); }
}
