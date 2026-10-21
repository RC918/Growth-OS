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

const errorResponse = (status, {code, type, requestId, secret} = {}) => ({
  ok: false, status,
  headers: {get: (name) => name === 'x-request-id' ? (requestId ?? null)
    : name === 'retry-after' ? '0' : null},
  json: async () => ({request_id: requestId, error: {code, type, message: 'x', ...(secret ? {secret} : {})}}),
});

test('401 preserves safe diagnostics and counts the failed attempt', async () => {
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async () => errorResponse(401, {
      code: 'invalid_api_key', type: 'invalid_request_error',
      requestId: 'req_401_test', secret: 'must-never-be-recorded'})});
  const error = await transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'})
    .catch(e => e);
  assert.match(error.message, /OPENAI_CLIENT: HTTP 401/);
  assert.deepEqual(error.apiError, {
    http_status: 401, error_type: 'invalid_request_error',
    error_code: 'invalid_api_key', request_id: 'req_401_test'});
  assert.equal(budget.attempts.length, 1);
  assert.equal(budget.attempts[0].outcome, 'failed');
  assert.equal(budget.attempts[0].http_status, 401);
  assert.equal(budget.entries.length, 0);
  assert.ok(!JSON.stringify({apiError: error.apiError, attempts: budget.attempts})
    .includes('must-never-be-recorded'));
  assert.ok(!JSON.stringify(budget.attempts).includes('test-key-not-real'));
});

test('403 preserves permission diagnostics and counts the attempt', async () => {
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async () => errorResponse(403, {
      code: 'permission_denied', type: 'permission_error', requestId: 'req_403_test'})});
  const error = await transport({instructions: 'x', facts: {}, market: 'US', language: 'en'})
    .catch(e => e);
  assert.deepEqual(error.apiError, {
    http_status: 403, error_type: 'permission_error',
    error_code: 'permission_denied', request_id: 'req_403_test'});
  assert.equal(budget.attempts.length, 1);
  assert.equal(budget.entries.length, 0);
});

test('failed attempts and retries cannot bypass the request cap', async () => {
  let calls = 0;
  const failBudget = createTrialBudget({maxRequests: 2});
  const failing = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget: failBudget,
    fetchImpl: async () => { calls++; return errorResponse(401, {code: 'invalid_api_key'}); }});
  await assert.rejects(failing({instructions: 'x', facts: {}}), /HTTP 401/);
  await assert.rejects(failing({instructions: 'x', facts: {}}), /HTTP 401/);
  await assert.rejects(failing({instructions: 'x', facts: {}}), /TRIAL_REQUEST_CAP/);
  assert.equal(calls, 2);
  assert.equal(failBudget.attempts.length, 2);

  // A 429 retry is a second HTTP send: with only one send allowed, the
  // retry must be stopped by preflight instead of exceeding the cap.
  let retryCalls = 0;
  const retryBudget = createTrialBudget({maxRequests: 1});
  const limited = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget: retryBudget,
    sleep: async () => {},
    fetchImpl: async () => { retryCalls++;
      return errorResponse(429, {code: 'rate_limit_exceeded'}); }});
  await assert.rejects(limited({instructions: 'x', facts: {}}), /TRIAL_REQUEST_CAP/);
  assert.equal(retryCalls, 1);
  assert.equal(retryBudget.attempts.length, 1);
  assert.equal(retryBudget.attempts[0].outcome, 'retrying');
});

test('timeout records an UNKNOWN_OUTCOME attempt', async () => {
  const budget = createTrialBudget({});
  const slow = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    budget, timeoutMs: 5,
    fetchImpl: async () => { await new Promise(r => setTimeout(r, 50)); return okResponse(); }});
  const error = await slow({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'})
    .catch(e => e);
  assert.match(error.message, /UNKNOWN_OUTCOME/);
  assert.equal(error.apiError.outcome, 'UNKNOWN_OUTCOME');
  assert.equal(budget.attempts.length, 1);
  assert.equal(budget.attempts[0].outcome, 'UNKNOWN_OUTCOME');
  assert.equal(budget.entries.length, 0);
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
