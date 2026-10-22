import test from 'node:test';
import assert from 'node:assert/strict';
import {runPhase3aFlow} from './flow.mjs';

const report = {
  snapshot: {id: 'snap-1'},
  facts: {
    product_name: {value: 'The Clark', citations: ['s1'], verification: 'source_asserted'},
    title: {value: 'The Clark', citations: ['s1'], verification: 'source_asserted'},
    meta_description: {value: 'Maple complete skateboard', citations: ['s2'], verification: 'source_asserted'},
    description: {value: 'The Clark. Maple complete with 54mm wheels.', citations: ['s3'], verification: 'source_asserted'},
  },
};
const goodModel = async () => ({usage: {cost: 0.002}, suggestions: {
  title: {text: 'The Clark', used_fact_ids: ['product_name']},
  meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
  description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
}});

test('without human approval the AI model is never called', async () => {
  let calls = 0;
  const out = await runPhase3aFlow({
    report, market: 'TW', language: 'zh-TW',
    model: async (...a) => { calls++; return goodModel(...a); },
  });
  assert.equal(out.status, 'AWAITING_APPROVAL');
  assert.equal(calls, 0);
});

test('approved flow executes pipeline and verifies into review', async () => {
  const out = await runPhase3aFlow({
    report, market: 'TW', language: 'zh-TW', model: goodModel, approved_by: 'owner',
  });
  assert.equal(out.status, 'AWAITING_REVIEW');
  assert.equal(out.task.state, 'done');
  assert.equal(out.total_cost, 0.002);
});

test('fact-conflicting model output escalates instead of completing', async () => {
  const out = await runPhase3aFlow({
    report, market: 'TW', language: 'zh-TW', approved_by: 'owner',
    model: async () => ({usage: {cost: 0.002}, suggestions: {
      title: {text: 'The Clark 999', used_fact_ids: ['product_name']},
      meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
      description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
    }}),
  });
  assert.equal(out.status, 'ESCALATED');
  assert.equal(out.task.state, 'escalated');
});
