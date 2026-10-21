import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAiTransport, createTrialBudget, estimateCost, estimateInputTokens, parseResponsesSuggestions, TRIAL_TOKEN_CAPS} from './openai-live-gate.mjs';

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
  const out = await transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW', max_output_tokens: 800});
  assert.equal(out.usage.cost, estimateCost({inputTokens: 1000, outputTokens: 500}));
  await assert.rejects(
    transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW', max_output_tokens: 800}),
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

const suggestionJson = JSON.stringify({
  title: {text: 'The Clark', used_fact_ids: ['product_name']},
  meta_description: {text: 'Maple complete skateboard', used_fact_ids: ['meta_description']},
  description: {text: 'The Clark. Maple complete with 54mm wheels.', used_fact_ids: ['description']},
  geo_qa: [{question: 'What is The Clark?', answer: 'The Clark.', used_fact_ids: ['description']}]});
const nativeResponse = (payload) => ({
  ok: true, status: 200, headers: {get: () => null},
  json: async () => payload,
});

test('native Responses output array is parsed without output_text', async () => {
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async () => nativeResponse({
      id: 'resp_native_1', status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: suggestionJson}]}],
      usage: {input_tokens: 100, output_tokens: 50}})});
  const out = await transport({instructions: 'x', facts: {}, market: 'TW', language: 'zh-TW'});
  assert.equal(out.suggestions.title.text, 'The Clark');
  assert.equal(budget.entries.length, 1);
  assert.equal(budget.attempts[0].outcome, 'success');
  assert.equal(parseResponsesSuggestions({
    status: 'completed',
    output: [{content: [{type: 'output_text', text: suggestionJson}]}]}).geo_qa.length, 1);
});

test('incomplete, refusal, malformed and missing output fail safely but keep HTTP accounting', async () => {
  const scenarios = [
    [{id: 'resp_inc', status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'},
      output: [], usage: {input_tokens: 10, output_tokens: 5}}, /OPENAI_INCOMPLETE/, 'max_output_tokens'],
    [{id: 'resp_ref', status: 'completed',
      output: [{type: 'message', content: [{type: 'refusal', refusal: 'no'}]}],
      usage: {input_tokens: 10, output_tokens: 5}}, /OPENAI_REFUSAL/, 'refusal'],
    [{id: 'resp_bad', status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: 'not-json'}]}],
      usage: {input_tokens: 10, output_tokens: 5}}, /not valid JSON/, 'invalid_json'],
    [{id: 'resp_empty', status: 'completed', output: [],
      usage: {input_tokens: 10, output_tokens: 5}}, /no output text/, 'missing_output_text'],
    [{id: 'resp_partial', status: 'completed', output_text: JSON.stringify({title: {}}),
      usage: {input_tokens: 10, output_tokens: 5}}, /missing field/, 'missing_field_meta_description'],
  ];
  for (const [payload, pattern, code] of scenarios) {
    const budget = createTrialBudget({});
    const transport = createOpenAiTransport({
      enabled: true, credentialProvider: () => 'test-key-not-real', budget,
      fetchImpl: async () => nativeResponse(payload)});
    const error = await transport({instructions: 'x', facts: {}}).catch(e => e);
    assert.match(error.message, pattern);
    assert.equal(error.apiError.error_code, code);
    assert.equal(error.apiError.http_status, 200);
    // The HTTP request succeeded and may be billed: its cost entry and
    // attempt survive the parse failure.
    assert.equal(budget.entries.length, 1);
    assert.equal(budget.attempts.length, 1);
    assert.equal(budget.attempts[0].outcome, 'parse_failed');
    assert.ok(error.usage.cost > 0);
  }
});

test('output token cap is synchronized between request, gate and cost preflight', async () => {
  assert.equal(TRIAL_TOKEN_CAPS.outputPerRequest, 3000);
  assert.ok(Math.abs(estimateCost({inputTokens: 1200, outputTokens: 3000}) - 0.0063) < 1e-9);

  // A response using more than the old 1000-token gate but within the
  // new cap now succeeds, and the wire request carries the same cap.
  let wireBody;
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async (_url, options) => {
      wireBody = JSON.parse(options.body);
      return nativeResponse({
        id: 'resp_big', status: 'completed',
        output: [{type: 'message', content: [{type: 'output_text', text: suggestionJson}]}],
        usage: {input_tokens: 1200, output_tokens: 2400}});
    }});
  const out = await transport({instructions: 'x', facts: {}});
  assert.equal(wireBody.max_output_tokens, 3000);
  assert.equal(out.usage.output_tokens, 2400);
  assert.equal(out.usage.cost, estimateCost({inputTokens: 1200, outputTokens: 2400}));

  // Above the shared cap the gate refuses before any HTTP send.
  let calls = 0;
  const capped = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    budget: createTrialBudget({}),
    fetchImpl: async () => { calls++; return nativeResponse({}); }});
  await assert.rejects(
    capped({instructions: 'x', facts: {}, max_output_tokens: 3001}),
    /TRIAL_OUTPUT_TOKEN_CAP/);
  assert.equal(calls, 0);
});

test('input gate uses actual sent content and never trusts a low caller estimate', async () => {
  const withoutSchema = estimateInputTokens({instructions: 'x'.repeat(100), userContent: 'y'.repeat(50)});
  const withSchema = estimateInputTokens({
    instructions: 'x'.repeat(100), userContent: 'y'.repeat(50),
    schemaText: JSON.stringify({type: 'object', properties: {a: {type: 'string'}}}),
    envelopeText: JSON.stringify({model: 'gpt-5-mini-2025-08-07', input: [{role: 'system'}]})});
  assert.ok(withSchema > withoutSchema);
  assert.ok(withoutSchema > 0 && withoutSchema < 150); // estimate, not a byte count
  let calls = 0;
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    budget: createTrialBudget({}),
    fetchImpl: async () => { calls++; return okResponse(); }});
  await assert.rejects(transport({
    instructions: 'x', estimated_input_tokens: 1,
    facts: {blob: '測'.repeat(2500)}, market: 'TW', language: 'zh-TW'}),
    /TRIAL_INPUT_TOKEN_CAP/);
  assert.equal(calls, 0);

  // Insufficient budget is also stopped before sending.
  let budgetCalls = 0;
  const poor = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real',
    budget: createTrialBudget({trialCapUsd: 0.0001}),
    fetchImpl: async () => { budgetCalls++; return okResponse(); }});
  await assert.rejects(poor({instructions: 'x', facts: {}}), /TRIAL_BUDGET_CAP/);
  assert.equal(budgetCalls, 0);
});

test('unknown usage is costed conservatively, never as zero', async () => {
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async () => nativeResponse({
      id: 'resp_nousage', status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: suggestionJson}]}]})});
  const out = await transport({instructions: 'x', facts: {}});
  assert.equal(out.usage.usage_reported, false);
  assert.equal(out.usage.input_tokens, null);
  assert.ok(out.usage.cost > 0);
  assert.equal(budget.entries[0].output_tokens, 3000);
});

test('reported usage above the input gate fails closed after accounting', async () => {
  const budget = createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, credentialProvider: () => 'test-key-not-real', budget,
    fetchImpl: async () => nativeResponse({
      id: 'resp_over', status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: suggestionJson}]}],
      usage: {input_tokens: 9999, output_tokens: 10}})});
  const error = await transport({instructions: 'x', facts: {}}).catch(e => e);
  assert.match(error.message, /USAGE_INPUT_CAP_EXCEEDED/);
  assert.equal(budget.entries.length, 1);
  assert.equal(budget.attempts[0].outcome, 'usage_exceeds_input_cap');
});

test('non-completed status and null suggestion fields fail explicitly', () => {
  for (const status of ['in_progress', 'queued']) {
    const error = (() => { try {
      parseResponsesSuggestions({status, output_text: suggestionJson});
      return null;
    } catch (e) { return e; } })();
    assert.match(error.message, /OPENAI_RESPONSE_NOT_COMPLETED/);
    assert.equal(error.apiError.http_status, 200);
  }
  const nullFields = (() => { try {
    parseResponsesSuggestions({status: 'completed', output_text: JSON.stringify({
      title: null, meta_description: null, description: null, geo_qa: null})});
    return null;
  } catch (e) { return e; } })();
  assert.match(nullFields.message, /missing field title/);
  assert.equal(nullFields.apiError.error_code, 'missing_field_title');
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
