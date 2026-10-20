// Phase 3A integrated flow (isolated): one URL-result report goes
// through the Growth Engine state machine; the AI SEO pipeline is
// the isolated executor, and fact verification is the auto-verify
// stage. Human approval is still required before any AI call runs.

import {createGrowthEngine} from '../growth-engine/engine.mjs';
import {createCostLedger, runAiSeoPipeline} from '../ai-seo/ai-seo-pipeline.mjs';

export async function runPhase3aFlow({
  report, market, language, model,
  taskBudget = 0.01, engineBudget = 1, approved_by = null,
}) {
  const engine = createGrowthEngine({budget: engineBudget});
  const ledger = createCostLedger(taskBudget);
  const task = engine.submit({
    key: 'ai-seo:' + (report?.snapshot?.id ?? 'unknown'),
    title: 'AI SEO optimization', tier: 'L1_isolated', estimate: taskBudget,
  });
  await engine.run(task.id, {
    analyze: async () => ({facts_ready: Boolean(report?.facts)}),
  });
  if (!approved_by) {
    return {status: 'AWAITING_APPROVAL', task, audit: engine.audit};
  }
  const done = await engine.approveAndExecute(task.id, {
    approved_by,
    execute: async () => runAiSeoPipeline({report, market, language, model, ledger}),
    verify: async task =>
      task.result?.status === 'AWAITING_REVIEW'
        ? {ok: true}
        : {ok: false, detail: 'pipeline status ' + (task.result?.status ?? 'none')},
  });
  return {
    status: done.state === 'done' ? 'AWAITING_REVIEW' : done.state.toUpperCase(),
    task: done, pipeline: done.result, audit: engine.audit,
    total_cost: ledger.spent(),
  };
}
