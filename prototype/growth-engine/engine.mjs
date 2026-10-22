// Phase 3A minimal autonomous Growth Engine (isolated prototype).
//
// Reuses the existing Controller's checkpoint concepts; it is NOT a
// second production controller and runs only injected, isolated
// executors. Flow:
//   analyze -> candidates -> prioritize -> HUMAN APPROVAL GATE ->
//   isolated execute -> auto-verify -> done | escalate
// Guarantees: tiered authorization, task state machine, retry cap,
// idempotency by task key, budget cap, failure recovery to a safe
// state, and a traceable audit log. Nothing here touches real
// sites, ads, paid services or Production.

const TRANSITIONS = {
  queued: ['analyzing', 'escalated'],
  analyzing: ['candidate', 'escalated'],
  candidate: ['awaiting_approval', 'escalated'],
  awaiting_approval: ['approved', 'rejected', 'escalated'],
  approved: ['executing', 'escalated'],
  executing: ['verifying', 'retry_wait', 'escalated'],
  retry_wait: ['executing', 'escalated'],
  verifying: ['done', 'escalated'],
  done: [], rejected: [], escalated: [],
};

export function createGrowthEngine({budget = 1, maxRetries = 2, clock = () => Date.now()} = {}) {
  const tasks = new Map();
  const audit = [];
  let spent = 0;
  const log = (task_id, event, detail = '') => {
    audit.push({at: new Date(clock()).toISOString(), task_id, event, detail});
  };
  function transition(task, next) {
    if (!TRANSITIONS[task.state].includes(next)) {
      throw Error(`Illegal transition ${task.state} -> ${next}`);
    }
    task.state = next;
    log(task.id, 'state:' + next);
  }
  return {
    audit,
    spent: () => spent,
    submit({key, title, tier, priority = 0, estimate = 0}) {
      if (!['L0_readonly', 'L1_isolated', 'L2_production'].includes(tier)) {
        throw Error('Unknown authorization tier: ' + tier);
      }
      const existing = [...tasks.values()].find(t => t.key === key);
      if (existing) return existing; // idempotent: same key, same task
      const task = {
        id: 'task-' + (tasks.size + 1), key, title, tier, priority,
        estimate, state: 'queued', retries: 0, result: null,
      };
      tasks.set(task.id, task);
      log(task.id, 'submitted', tier);
      return task;
    },
    async run(task_id, {analyze, execute, verify}) {
      const task = tasks.get(task_id);
      if (!task) throw Error('Unknown task');
      if (task.tier === 'L2_production') {
        transition(task, 'escalated');
        log(task.id, 'escalated', 'production tier requires Owner');
        return task;
      }
      if (spent + task.estimate > budget) {
        transition(task, 'escalated');
        log(task.id, 'escalated', 'budget cap');
        return task;
      }
      transition(task, 'analyzing');
      task.candidate = await analyze(task);
      transition(task, 'candidate');
      transition(task, 'awaiting_approval');
      return task; // human gate: run() never self-approves
    },
    async approveAndExecute(task_id, {approved_by, execute, verify}) {
      const task = tasks.get(task_id);
      if (!task || task.state !== 'awaiting_approval') {
        throw Error('Task is not awaiting approval');
      }
      if (!approved_by) throw Error('Human approval required');
      transition(task, 'approved');
      log(task.id, 'approved', approved_by);
      transition(task, 'executing');
      for (;;) {
        try {
          task.result = await execute(task);
          spent += task.estimate;
          break;
        } catch (error) {
          task.retries++;
          log(task.id, 'execute_failed', String(error.message).slice(0, 80));
          if (task.retries > maxRetries) {
            transition(task, 'escalated');
            log(task.id, 'escalated', 'retry cap exceeded; state preserved for recovery');
            return task;
          }
          transition(task, 'retry_wait');
          transition(task, 'executing');
        }
      }
      transition(task, 'verifying');
      const verdict = await verify(task);
      if (!verdict?.ok) {
        transition(task, 'escalated');
        log(task.id, 'escalated', 'verification failed: ' + (verdict?.detail ?? ''));
        return task;
      }
      transition(task, 'done');
      return task;
    },
    reject(task_id, by) {
      const task = tasks.get(task_id);
      if (!task || task.state !== 'awaiting_approval') throw Error('Not awaiting approval');
      transition(task, 'rejected');
      log(task.id, 'rejected', by);
      return task;
    },
    list: () => [...tasks.values()].sort((a, b) => b.priority - a.priority),
  };
}
