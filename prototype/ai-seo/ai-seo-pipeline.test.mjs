import test from 'node:test';
import assert from 'node:assert/strict';
import {applyUserEdits, createCostLedger, runAiSeoPipeline, verifySuggestions} from './ai-seo-pipeline.mjs';

const report = {
  page_type: 'product',
  extraction: {method: 'declared_product_dom'},
  facts: {
    product_name: {value: 'The Clark', citations: ['s1'], verification: 'source_asserted'},
    title: {value: 'The Clark', citations: ['s1'], verification: 'source_asserted'},
    meta_description: {value: 'Maple complete skateboard', citations: ['s2'], verification: 'source_asserted'},
    description: {value: 'The Clark. Maple complete with 54mm wheels.', citations: ['s3'], verification: 'source_asserted'},
  },
};

const goodModel = (language) => async ({facts}) => ({
  usage: {input_tokens: 120, output_tokens: 60, cost: 0.002},
  suggestions: {
    title: {text: language === 'en' ? 'The Clark Complete Skateboard' : 'The Clark 完整滑板',
      used_fact_ids: ['product_name', 'description']},
    meta_description: {text: language === 'en' ? 'Maple complete skateboard' : 'Maple 完整滑板',
      used_fact_ids: ['meta_description']},
    description: {text: language === 'en' ? 'The Clark. Maple complete with 54mm wheels.' : 'The Clark。Maple 完整滑板，54mm 輪。',
      used_fact_ids: ['description']},
  },
});

test('zh-TW and en pipelines produce labelled suggestions with citations and cost', async () => {
  for (const language of ['zh-TW', 'en']) {
    const ledger = createCostLedger(0.01);
    const out = await runAiSeoPipeline({
      report, market: language === 'en' ? 'US' : 'TW', language,
      model: goodModel(language), ledger});
    assert.equal(out.status, 'AWAITING_REVIEW');
    assert.equal(out.fields.title.original, 'The Clark');
    assert.ok(out.fields.title.ai_suggestion);
    assert.equal(out.fields.title.user_edit, null);
    assert.ok(out.fields.description.citations.length > 0);
    assert.equal(out.cost.input_tokens, 120);
    assert.equal(ledger.spent(), 0.002);
  }
});

test('hyphenated compounds require an adjacent source phrase', () => {
  const facts = {
    product_name: {value: 'Twin board built for street. Riders kick hard.', citations: ['s1'], verification: 'source_asserted'},
    title: {value: 'Twin board', citations: ['s1'], verification: 'source_asserted'},
    meta_description: {value: null, citations: [], verification: 'UNKNOWN'},
    description: {value: 'Twin board built for street. Riders kick hard.', citations: ['s1'], verification: 'source_asserted'},
  };
  const problems = verifySuggestions({
    title: {text: 'Twin-Kick Board', used_fact_ids: ['product_name']},
    meta_description: {text: 'Twin board', used_fact_ids: ['product_name']},
    description: {text: 'Twin board', used_fact_ids: ['description']},
  }, facts);
  assert.ok(problems.some(p => p.includes('Twin-Kick')));
});

test('model inventing a price fails closed', async () => {
  const ledger = createCostLedger(0.01);
  const out = await runAiSeoPipeline({
    report, market: 'TW', language: 'zh-TW', ledger,
    model: async () => ({usage: {cost: 0.002}, suggestions: {
      title: {text: 'The Clark 特價 999', used_fact_ids: ['product_name']},
      meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
      description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
    }})});
  assert.equal(out.status, 'FAIL_CLOSED');
  assert.equal(out.suggestions, null);
  assert.ok(out.problems.some(p => p.includes('999')));
});

test('lowercase invented claim and overshooting actual cost fail closed', async () => {
  const ledger = createCostLedger(0.01);
  const invented = await runAiSeoPipeline({
    report, market: 'US', language: 'en', ledger,
    model: async () => ({usage: {cost: 0.002}, suggestions: {
      title: {text: 'The Clark titanium edition', used_fact_ids: ['product_name']},
      meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
      description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
    }})});
  assert.equal(invented.status, 'FAIL_CLOSED');
  assert.ok(invented.problems.some(p => p.includes('titanium')));

  const pricey = await runAiSeoPipeline({
    report, market: 'US', language: 'en', ledger: createCostLedger(0.01),
    model: async () => ({usage: {cost: 0.5}, suggestions: {
      title: {text: 'The Clark', used_fact_ids: ['product_name']},
      meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
      description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
    }})});
  assert.equal(pricey.status, 'FAIL_CLOSED');
  assert.ok(pricey.problems.some(p => p.includes('budget')));
});

test('user edits are fact-verified before becoming final fields', async () => {
  const ledger = createCostLedger(0.01);
  const out = await runAiSeoPipeline({
    report, market: 'TW', language: 'zh-TW', model: goodModel('zh-TW'), ledger});
  assert.equal(out.status, 'AWAITING_REVIEW');
  const reviewed = applyUserEdits(out, {title: 'The Clark 完整滑板'});
  assert.equal(reviewed.status, 'REVIEWED');
  assert.equal(reviewed.fields.title.final_source, 'user_edit');
  assert.equal(reviewed.fields.description.final_source, 'ai_suggestion');
  const bad = applyUserEdits(out, {title: 'The Clark 特價 999'});
  assert.equal(bad.status, 'FAIL_CLOSED');
  assert.equal(bad.fields.title.user_edit, null);
});

test('unknown facts stay UNKNOWN and budget cap blocks new calls', async () => {
  const sparse = structuredClone(report);
  delete sparse.facts.meta_description;
  const ledger = createCostLedger(0.003);
  const first = await runAiSeoPipeline({
    report: sparse, market: 'TW', language: 'zh-TW',
    model: goodModel('zh-TW'), ledger});
  assert.ok(first.unknown_fields.includes('meta_description')
    || first.status === 'FAIL_CLOSED'); // model may not invent the missing meta
  const blocked = await runAiSeoPipeline({
    report, market: 'TW', language: 'zh-TW',
    model: goodModel('zh-TW'), ledger: createCostLedger(0.001)});
  assert.equal(blocked.status, 'BUDGET_BLOCKED');
});
