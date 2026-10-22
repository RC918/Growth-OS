import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSeoRequest, createModelAdapter} from './model-adapter.mjs';

test('zero-call stage refuses real calls and live requires budget', async () => {
  const adapter = createModelAdapter();
  assert.equal(adapter.provider, 'openai');
  assert.equal(adapter.live_enabled, false);
  await assert.rejects(adapter.complete({}), /NO_MODEL_TRANSPORT/);
  assert.throws(() => createModelAdapter({liveEnabled: true, monthlyBudget: 0}));
});

test('injected transport is used in tests without enabling live', async () => {
  const adapter = createModelAdapter({
    transport: async req => ({echo_market: req.market}),
  });
  const out = await adapter.complete({market: 'TW'});
  assert.equal(out.echo_market, 'TW');
});

test('seo request carries only trusted facts and unknown markers', () => {
  const req = buildSeoRequest({
    facts: {title: {value: 'The Clark'}, price: {value: null}},
    market: 'TW', language: 'zh-TW', fields: ['title'],
  });
  assert.equal(req.market, 'TW');
  assert.equal(req.facts.price.value, null);
  assert.match(req.instructions, /Do not invent/);
});

test('seo request separates fact IDs from citation IDs with an auditable map', () => {
  const req = buildSeoRequest({
    facts: {
      product_name: {value: 'The Clark', citations: ['s2']},
      title: {value: 'The Clark • Landyachtz', citations: ['s3']},
      meta_description: {value: null, citations: []},
      description: {value: 'A skateboard', citations: ['s4', 's5', 's2']},
    },
    market: 'TW', language: 'zh-TW', fields: ['title', 'meta_description', 'description'],
  });
  // UNKNOWN meta_description is not an allowed fact ID.
  assert.deepEqual(req.allowed_fact_ids, ['product_name', 'title', 'description']);
  assert.deepEqual(req.fact_citation_map, {
    product_name: ['s2'], title: ['s3'], description: ['s4', 's5', 's2']});
  assert.match(req.instructions, /Never return citation IDs/);
  assert.match(req.instructions, /product_name, title, description/);
});
