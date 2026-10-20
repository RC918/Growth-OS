import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAiTransport, createTrialBudget, estimateCost} from './openai-live-gate.mjs';

const okResponse = (cost = {}) => ({
  ok: true, status: 200, headers: {get: () => null},
  json: async () => ({output_text: JSON.stringify({
    title: {text: 'The Clark', used_fact_ids: ['product_name']},
    meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
    description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
    geo_qa: [{question: 'What is The Clark?', answer: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']}]}),
  usage: {input_tokens: cost.input ?? 1000, output_tokens: cost.output ?? 500}}),
});

test('transport is disabled by default and never calls fetch', async () => {
  let calls = 0;
  const transport = createOpenAiTransport({fetchImpl: async () => { calls++; }});
  await assert.rejects(transport({}), /LIVE_TRANSPORT_DISABLED/);
  assert.equal(calls, 0);
});

test('cost estimate follows published gpt-5-mini pricing', () => {
  // 1M input + 1M output = 0.25 + 2.00 USD.
  assert.equal(estimateCost({inputTokens: 1_000_000, outputTokens: 1_000_000}), 2.25);
  assert.ok(Math.abs(estimateCost({inputTokens: 1200, outputTokens: 800}) - 0.0019) < 1e-9);
});

test('trial budget enforces request, token and spend caps', async () => {
  const budget = createTrialBudget({trialCapUsd: 0.003, maxRequests: 1});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    fetchImpl: async () => okResponse(), budget});
  const out = await transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'});
  assert.equal(out.usage.cost, estimateCost({inputTokens: 1000, outputTokens: 500}));
  await assert.rejects(
    transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'}),
    /TRIAL_REQUEST_CAP|TRIAL_BUDGET_CAP/);
  const tokenBudget = createTrialBudget({});
  assert.throws(() => tokenBudget.preflight({inputTokens: 99999, outputTokens: 10}),
    /TRIAL_INPUT_TOKEN_CAP/);
});

test('vendor spend-limit 429 stops the trial without retry', async () => {
  let calls = 0;
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async () => { calls++; return {ok: false, status: 429,
      headers: {get: () => null},
      json: async () => ({error: {code: 'project_spend_limit_exceeded'}})}; }});
  await assert.rejects(
    transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'}),
    /VENDOR_SPEND_LIMIT/);
  assert.equal(calls, 1);
  assert.ok(budget.stopped);
});

test('rate-limit 429 retries once; timeout never retries', async () => {
  let calls = 0; const sleeps = [];
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    budget: createTrialBudget({}), sleep: async ms => { sleeps.push(ms); },
    fetchImpl: async () => { calls++;
      if (calls === 1) return {ok: false, status: 429, headers: {get: () => '0'},
        json: async () => ({error: {code: 'rate_limit_exceeded'}})};
      return okResponse(); }});
  const out = await transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'});
  assert.ok(out.suggestions.title);
  assert.equal(calls, 2);
  assert.equal(sleeps.length, 1);

  let timeoutCalls = 0;
  const slow = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    budget: createTrialBudget({}), timeoutMs: 5,
    fetchImpl: async () => { timeoutCalls++;
      await new Promise(resolve => setTimeout(resolve, 50)); return okResponse(); }});
  await assert.rejects(
    slow({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'}),
    /UNKNOWN_OUTCOME/);
  assert.equal(timeoutCalls, 1);
});
