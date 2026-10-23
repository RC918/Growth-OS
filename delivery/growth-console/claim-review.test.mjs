import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createConsoleSourceContext, evaluateConsoleClaims} from '../../apps/web/console-claim-review.mjs';
import {createConsoleTask} from '../../apps/web/growth-console-task.mjs';
import {claimEngineSource} from './build-claim-engine.mjs';
import {createResultReview} from '../../apps/web/first-result-review.mjs';
import {validateReport} from '../../apps/web/first-result-payload.mjs';

const reportFor = kind => JSON.parse(execFileSync('python3', ['-B', 'delivery/growth-console/claim-source-fixture.py', '--report', kind], {encoding: 'utf8'}));
const fieldsFor = report => Object.fromEntries(Object.entries(report.preview.fields).map(([key, value]) => [key, value.suggested]));
const normal = reportFor('normal');
const evaluate = (report, edits = {}) => evaluateConsoleClaims({report, fields: {...fieldsFor(report), ...edits}});
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};

test('browser engine is the deterministic package of unchanged verifier sources', async () => {
  assert.equal(await readFile('apps/web/console-claim-engine.mjs', 'utf8'), await claimEngineSource());
});
test('actual producer rules prove normal indexed features and full evidence without changing the report', () => {
  const before = structuredClone(normal), result = evaluate(normal);
  assert.equal(result.mapping_status, 'PROVEN_EXTRACTIVE_CONTEXT');
  assert.equal(result.decision, 'PASS_WITH_REVIEW');
  assert.ok(result.fields[0].claims.some(claim => claim.status === 'REVIEW'));
  assert.ok(result.declared.description.includes('/facts/features/0'));
  for (const [i, feature] of normal.facts.features.entries()) {
    const evidence = result.source_context.find(fact => fact.fact_id === '/facts/features/' + i);
    assert.equal(evidence.value, feature.value);
    assert.deepEqual(evidence.product_scope, feature.product_scope);
    assert.deepEqual(evidence.citation_ids, feature.citations);
  }
  assert.deepEqual(normal, before);
  assert.ok(evaluate(normal, {description: 'Not made of steel.'}).fields[2].claims.some(claim => claim.status === 'CONTRADICTED'));
});
test('producer differential: Python codepoints, truncation and name boundaries do not truncate evidence', () => {
  for (const kind of ['unicode', 'long', 'word-boundary']) {
    const report = reportFor(kind), context = createConsoleSourceContext(report);
    assert.deepEqual(context.original_suggestions, fieldsFor(report));
    assert.equal(context.source_context.find(f => f.fact_id === '/facts/description').value, report.facts.description.value);
  }
  assert.equal(evaluate(reportFor('long')).decision, 'FAIL_CLOSED');
});
test('complete same-product context vetoes opposite sources, even excluded features', () => {
  for (const kind of ['opposite', 'hidden-opposite']) {
    const report = reportFor(kind), result = evaluate(report);
    assert.equal(result.decision, 'FAIL_CLOSED');
    assert.ok(result.fields[1].claims.some(claim => claim.status === 'SOURCE_CONFLICT'));
    if (kind === 'hidden-opposite') {
      assert.equal(result.declared.description.includes('/facts/features/2'), false);
      assert.equal(result.source_context.find(f => f.fact_id === '/facts/features/2').value, report.facts.features[2].value);
    }
  }
  const report = reportFor('hidden-unrelated-conflict'), result = evaluate(report);
  assert.equal(result.declared.description.includes('/facts/features/2'), false);
  assert.equal(result.declared.description.includes('/facts/features/3'), false);
  assert.equal(result.decision, 'FAIL_CLOSED');
  assert.ok(result.source_conflicts.some(claim => claim.status === 'SOURCE_CONFLICT'));
});
test('undeclared other-field positives never support an edit; UNKNOWN is fail closed', () => {
  const result = evaluate(reportFor('undeclared-positive'), {meta_description: 'Made of titanium.'});
  assert.equal(result.fields[1].decision, 'FAIL_CLOSED');
  assert.ok(result.fields[1].claims.some(claim => claim.status === 'UNSUPPORTED'));
  assert.equal(evaluate(normal, {description: 'Waterproof.'}).decision, 'FAIL_CLOSED');
});
test('ambiguous mapping, partial/unknown/mixed-product facts and stale citations fail closed', () => {
  const changes = [
    r => {r.preview.fields.title.suggested = 'Different suggestion';},
    r => {r.preview.fields.description.citations.pop();},
    r => {r.facts.description.value = r.facts.description.value.slice(0, 10);},
    r => {r.facts.features[0].verification = 'UNKNOWN';},
    r => {r.facts.features[0].product_scope.product_name = 'Other product';},
    r => {r.snapshot.citations[0].source_version = 'other';},
    r => {r.conflicts = [{state: 'UNRESOLVED'}];},
  ];
  for (const change of changes) {
    const report = structuredClone(normal); change(report);
    const result = evaluate(report);
    assert.equal(result.decision, 'FAIL_CLOSED');
    assert.equal(result.mapping_status, 'UNKNOWN');
  }
});
test('task confirm itself vetoes bad checks, duplicate clicks do not bypass it, valid edits recover', async () => {
  const task = createConsoleTask({load: async () => normal}); task.setURL(normal.snapshot.original_url); await task.start();
  for (const key of Object.keys(fieldsFor(normal))) task.check(key, true);
  await Promise.all([task.confirm(), task.confirm()]);
  assert.equal(task.view().phase, 'complete');
  task.edit('description', 'Not made of steel.');
  assert.equal(task.view().review.receipt, null);
  assert.notEqual(task.view().claimReview.status, 'CHECKED');
  await task.checkClaims(); task.check('description', true);
  await Promise.all([task.confirm(), task.confirm()]);
  assert.equal(task.view().review.receipt, null);
  assert.equal(task.view().claimReview.result.decision, 'FAIL_CLOSED');
  task.edit('description', normal.preview.fields.description.suggested); await task.checkClaims(); task.check('description', true);
  await task.confirm(); assert.ok(task.view().review.receipt);
  task.setURL('https://example.com/other');
  assert.equal(task.view().claimReview.status, 'STALE'); assert.equal(task.view().review.receipt, null);
  await task.confirm(); assert.equal(task.view().review.receipt, null);
});
test('late check completion/rejection, cancel, replacement and return cannot authorize old input', async () => {
  const waiting = [];
  const task = createConsoleTask({load: async () => normal, claimCheck: input => {const item = deferred(); waiting.push({...item, input}); return item.promise;}});
  task.setURL(normal.snapshot.original_url); const start = task.start();
  for (let attempt = 0; !waiting.length && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(waiting.length, 1, 'validated source must reach the check boundary');
  task.edit('description', 'Not made of steel.'); await Promise.resolve();
  const original = waiting[0]; original.resolve(evaluateConsoleClaims(original.input)); await start;
  assert.equal(task.view().claimReview.status, 'CHECKING');
  task.revisit(); assert.equal(task.view().returned, true);
  task.cancelClaimCheck(); waiting[1].resolve(evaluateConsoleClaims(waiting[1].input)); await Promise.resolve(); await Promise.resolve();
  assert.equal(task.view().claimReview.status, 'STALE'); assert.equal(task.view().review.receipt, null);
  const next = task.checkClaims(); await Promise.resolve(); task.setURL('https://example.com/changed');
  waiting[2].reject(Error('late failure')); await next;
  assert.equal(task.view().claimReview.status, 'STALE'); assert.equal(task.view().sourceCurrent, false);
  const reread = task.start(); await Promise.resolve(); task.reset(); await reread;
  assert.equal(task.view().report, null);
});
test('a late confirmation digest and a failed latest checker cannot acquire a receipt', async () => {
  const task = createConsoleTask({load: async () => normal}); task.setURL(normal.snapshot.original_url); await task.start();
  for (const key of Object.keys(fieldsFor(normal))) task.check(key, true);
  const confirmation = task.confirm(); task.edit('description', 'Not made of steel.'); await confirmation; await task.checkClaims();
  assert.equal(task.view().review.receipt, null); assert.equal(task.view().phase, 'review');
  const broken = createConsoleTask({load: async () => normal, claimCheck: () => {throw Error('controlled checker failure');}});
  broken.setURL(normal.snapshot.original_url); await broken.start();
  for (const key of Object.keys(fieldsFor(normal))) broken.check(key, true);
  await broken.confirm(); assert.equal(broken.view().claimReview.status, 'ERROR'); assert.equal(broken.view().review.receipt, null);
});

// Reviewer P1: only result delivery is deferred. Every decision is computed by
// the real evaluator, with its complete original source context and vetoes.
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.fail('Timed out waiting for the actual check boundary');
};
const controlledChecks = () => {
  const waiting = [];
  const claimCheck = input => {
    const actualResult = evaluateConsoleClaims(input), pending = deferred();
    waiting.push({...pending, actualResult});
    return pending.promise.then(() => actualResult);
  };
  return {waiting, claimCheck};
};
const oldSceneReport = JSON.parse(await readFile('apps/web/growth-console-demo.json', 'utf8'));
const lifecycleState = task => {
  const s = task.view();
  return {synthetic: s.synthetic, phase: s.phase, updated: s.updated, source_current: s.sourceCurrent,
    task_id: s.taskId, url: s.url, snapshot_id: s.report?.snapshot.id, source_version: s.report?.snapshot.version,
    claim_status: s.claimReview.status, claim_decision: s.claimReview.result?.decision,
    checks: s.review?.fact_checks, revision: s.review?.revision, fields: s.review?.fields, receipt: s.review?.receipt};
};
const traceLifecycle = (label, before, task, waiting) => console.log(JSON.stringify({repair3_lifecycle: label,
  delayed_actual_decisions: waiting.map(item => item.actualResult.decision), before, after: lifecycleState(task)}));
const humanConfirm = async task => {
  for (const field of Object.keys(fieldsFor(normal))) task.check(field, true);
  await task.confirm();
  assert.equal(task.view().review.receipt?.scope, 'page_only');
};
for (const kind of ['complete', 'return', 'failed']) {
  test('stale scenario cannot modify a reset/replaced real source: ' + kind, async () => {
    const {waiting, claimCheck} = controlledChecks();
    const task = createConsoleTask({load: async () => normal, claimCheck});
    const oldScene = task.scenario(kind, oldSceneReport); await waitFor(() => waiting.length === 1);
    task.reset(); task.setURL(normal.snapshot.original_url); const fresh = task.start();
    await waitFor(() => waiting.length === 2); waiting[1].resolve(); await fresh;
    const before = lifecycleState(task);
    assert.equal(before.synthetic, false); assert.equal(before.phase, 'review');
    assert.notEqual(before.snapshot_id, oldSceneReport.snapshot.id);
    assert.notEqual(before.source_version, oldSceneReport.snapshot.version);
    assert.equal(before.receipt, null);
    assert.deepEqual(before.checks, {title: false, meta_description: false, description: false});
    waiting[0].resolve(); await oldScene; traceLifecycle('cross-source/' + kind, before, task, waiting);
    assert.deepEqual(lifecycleState(task), before, 'old scene must not check, confirm or change newer source state');
    await humanConfirm(task);
    assert.equal(task.view().review.receipt.snapshot_id, normal.snapshot.id);
  });
}
for (const kind of ['complete', 'return']) {
  test('stale scenario after reset with no review is inert: ' + kind, async () => {
    const {waiting, claimCheck} = controlledChecks();
    const task = createConsoleTask({load: async () => normal, claimCheck});
    const oldScene = task.scenario(kind, oldSceneReport); await waitFor(() => waiting.length === 1);
    task.reset(); const before = lifecycleState(task);
    waiting[0].resolve(); await oldScene; traceLifecycle('reset-only/' + kind, before, task, waiting);
    assert.deepEqual(lifecycleState(task), before);
    assert.equal(task.view().review, null);
  });
  for (const variant of ['edit', 'recheck', 'cancel', 'cancel-recheck']) {
    test('stale scenario cannot modify same-generation newer content/check: ' + kind + '/' + variant, async () => {
      const {waiting, claimCheck} = controlledChecks();
      const task = createConsoleTask({load: async () => oldSceneReport, claimCheck});
      const oldScene = task.scenario(kind, oldSceneReport); await waitFor(() => waiting.length === 1);
      if (variant === 'edit') task.edit('description', 'Made of steel.');
      if (variant.startsWith('cancel')) task.cancelClaimCheck();
      const fresh = ['recheck', 'cancel-recheck'].includes(variant) ? task.checkClaims() : null;
      if (variant !== 'cancel') {
        await waitFor(() => waiting.length === 2); waiting[1].resolve(); await fresh;
        await waitFor(() => task.view().claimReview.status === 'CHECKED');
      }
      const before = lifecycleState(task);
      assert.equal(before.revision, variant === 'edit' ? 1 : 0);
      assert.equal(before.claim_status, variant === 'cancel' ? 'STALE' : 'CHECKED');
      assert.equal(before.receipt, null);
      assert.deepEqual(before.checks, {title: false, meta_description: false, description: false});
      waiting[0].resolve(); await oldScene; traceLifecycle('same-generation/' + kind + '/' + variant, before, task, waiting);
      assert.deepEqual(lifecycleState(task), before, 'only old delivery occurred; no check, receipt or state mutation is authorized');
      if (variant === 'cancel') {
        await task.confirm(); assert.equal(task.view().review.receipt, null);
        const resumed = task.checkClaims(); await waitFor(() => waiting.length === 2); waiting[1].resolve(); await resumed;
      }
      await humanConfirm(task);
      assert.equal(task.view().review.receipt.revision, before.revision);
    });
  }
}
test('Python IGNORECASE producer prefix differential preserves exact text, citations and veto', async () => {
  for (const kind of ['prefix-dotted-name', 'prefix-dotless-name', 'prefix-ascii-name', 'prefix-lower-name',
    'prefix-word-boundary', 'prefix-literal', 'prefix-combining', 'prefix-long', 'prefix-opposite']) {
    const report = reportFor(kind);
    // A real producer report must also pass the unchanged frozen validator.
    await validateReport(await createResultReview(report).export());
    const result = evaluate(report);
    console.log(JSON.stringify({repair3_prefix: kind, name: report.facts.product_name.value,
      description: report.facts.description.value, producer_suggestion: report.preview.fields.description.suggested,
      mapping_status: result.mapping_status, decision: result.decision}));
    assert.equal(result.mapping_status, 'PROVEN_EXTRACTIVE_CONTEXT', kind);
    assert.deepEqual(result.original_suggestions, fieldsFor(report), kind);
    assert.equal(result.source_context.find(fact => fact.fact_id === '/facts/description').value, report.facts.description.value);
    assert.deepEqual(result.source_context.find(fact => fact.fact_id === '/facts/description').citation_ids, report.facts.description.citations);
    assert.equal(result.decision, kind === 'prefix-opposite' ? 'FAIL_CLOSED' : 'PASS_WITH_REVIEW', kind);
    if (kind === 'prefix-opposite') assert.ok(result.source_conflicts.some(claim => claim.status === 'SOURCE_CONFLICT'));
  }
});
