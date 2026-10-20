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
