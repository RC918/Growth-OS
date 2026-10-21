import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeLiveConfirmation, createKeychainCredentialProvider, createMockFetch, parseCliArgs, runTrial} from './run-phase3b-trial.mjs';
import {createTrialBudget} from './openai-live-gate.mjs';

const mockCredential = async () => 'mock-credential-not-real';
let nonceSeq = 0;
const liveConfirmation = () => 'PHASE3B-LIVE-ONCE:test-nonce-' + (++nonceSeq) + '-abcdefghij';

test('live mode is refused without single-use Owner confirmation or project id', async () => {
  let credentialCalls = 0; let fetchCalls = 0;
  const countingCredential = async () => { credentialCalls++; return 'x'; };
  const countingFetch = async () => { fetchCalls++; };
  await assert.rejects(runTrial({mode: 'live', credentialProvider: countingCredential, fetchImpl: countingFetch}),
    /LIVE_NOT_AUTHORIZED/);
  await assert.rejects(runTrial({mode: 'live', confirmation: liveConfirmation(),
    credentialProvider: countingCredential, fetchImpl: countingFetch}), /PROJECT_ID_REQUIRED/);
  await assert.rejects(runTrial({mode: 'live', confirmation: liveConfirmation(), projectId: 'not-a-project',
    credentialProvider: countingCredential, fetchImpl: countingFetch}), /PROJECT_ID_REQUIRED/);
  assert.equal(credentialCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('live confirmation is single-use and cannot be replayed', async () => {
  const confirmation = liveConfirmation();
  consumeLiveConfirmation(confirmation);
  assert.throws(() => consumeLiveConfirmation(confirmation), /already consumed/);
  assert.throws(() => consumeLiveConfirmation('yes'), /LIVE_NOT_AUTHORIZED/);
});

test('live budget limits cannot exceed US$5 or 12 requests', async () => {
  await assert.rejects(runTrial({mode: 'live', confirmation: liveConfirmation(),
    projectId: 'proj_test12345', credentialProvider: mockCredential,
    budget: createTrialBudget({trialCapUsd: 6})}), /US\$5/);
  await assert.rejects(runTrial({mode: 'live', confirmation: liveConfirmation(),
    projectId: 'proj_test12345', credentialProvider: mockCredential,
    budget: createTrialBudget({maxRequests: 13})}), /12-request/);
});

test('offline live path uses injected fetch, audits without secrets, then auto-disables', async () => {
  let seenUrl; let seenAuth;
  const summary = await runTrial({
    mode: 'live', confirmation: liveConfirmation(), projectId: 'proj_test12345',
    credentialProvider: async () => 'fake-secret-for-live-test',
    fetchImpl: async (url, options) => {
      seenUrl = url; seenAuth = options.headers.authorization;
      const body = JSON.parse(options.body);
      const {facts} = JSON.parse(body.input[1].content);
      const description = facts.description?.value ?? '';
      return {ok: true, status: 200, headers: {get: () => null}, json: async () => ({
        output_text: JSON.stringify({
          title: {text: facts.title?.value ?? '', used_fact_ids: ['title']},
          meta_description: {text: description, used_fact_ids: ['description']},
          description: {text: description, used_fact_ids: ['description']},
          geo_qa: [{question: 'What is it?', answer: description, used_fact_ids: ['description']}]}),
        usage: {input_tokens: 100, output_tokens: 50}})};
    },
  });
  assert.equal(summary.requests, 6);
  assert.equal(summary.token_caps.outputPerRequest, 3000);
  assert.equal(seenUrl, 'https://api.openai.com/v1/responses');
  assert.equal(seenAuth, 'Bearer ' + 'fake-secret-for-live-test');
  assert.equal(summary.live_enabled_after_run, false);
  assert.equal(summary.authorization_consumed, true);
  assert.ok(!JSON.stringify(summary).includes('fake-secret'));
  assert.equal(summary.audit.length, 6);
  assert.ok(summary.audit.every(a => a.project_id === 'proj_test12345' && !('authorization' in a)));
});

test('live 401 failure preserves summary evidence with one counted attempt', async () => {
  const summary = await runTrial({
    mode: 'live', confirmation: liveConfirmation(), projectId: 'proj_test12345',
    credentialProvider: async () => 'fake-secret-for-live-test',
    fetchImpl: async () => ({ok: false, status: 401,
      headers: {get: (name) => name === 'x-request-id' ? 'req_live_401' : null},
      json: async () => ({request_id: 'req_live_401', error: {
        code: 'invalid_api_key', type: 'invalid_request_error',
        secret: 'must-never-be-recorded'}})}),
  });
  assert.equal(summary.status, 'LIVE_FAILED');
  assert.match(summary.failure.error, /HTTP 401/);
  assert.equal(summary.attempted_requests, 1);
  assert.equal(summary.attempts.length, 1);
  assert.equal(summary.attempts[0].http_status, 401);
  assert.deepEqual(summary.failure.api_error, {
    http_status: 401, error_type: 'invalid_request_error',
    error_code: 'invalid_api_key', request_id: 'req_live_401'});
  assert.equal(summary.results.length, 1);
  assert.equal(summary.results[0].status, 'FAILED');
  assert.equal(summary.audit.length, 1);
  assert.ok(!JSON.stringify(summary).includes('must-never-be-recorded'));
  assert.ok(!JSON.stringify(summary).includes('fake-secret'));
});

test('single case and language ends normally with one attempt and partial scope', async () => {
  const summary = await runTrial({
    mode: 'mock', credentialProvider: mockCredential,
    caseId: 'landyachtz-the-clark', language: 'zh-TW',
    budget: createTrialBudget({maxRequests: 1}),
  });
  assert.equal(summary.status, 'MOCK_PASS');
  assert.equal(summary.acceptance_scope, 'PARTIAL_SELECTION');
  assert.equal(summary.selected_case, 'landyachtz-the-clark');
  assert.deepEqual(summary.selected_languages, ['zh-TW']);
  assert.equal(summary.results.length, 1);
  assert.equal(summary.audit.length, 1);
  assert.equal(summary.attempted_requests, 1);
  assert.equal(summary.requests, 1);
  assert.equal(summary.cost_complete, true);
  assert.equal(summary.cost_status, 'COMPLETE');
  assert.equal(summary.total_cost_usd, summary.known_cost_usd);
});

test('single-attempt cap blocks a 429 retry from sending twice', async () => {
  let calls = 0;
  const summary = await runTrial({
    mode: 'live', confirmation: liveConfirmation(), projectId: 'proj_test12345',
    credentialProvider: mockCredential, caseId: 'landyachtz-the-clark', language: 'en',
    budget: createTrialBudget({maxRequests: 1}),
    fetchImpl: async () => { calls++; return {ok: false, status: 429,
      headers: {get: () => '0'},
      json: async () => ({error: {code: 'rate_limit_exceeded', type: 'rate_limit_error'}})}; },
  });
  assert.equal(summary.status, 'LIVE_FAILED');
  assert.equal(calls, 1);
  assert.equal(summary.attempted_requests, 1);
  assert.match(summary.failure.error, /TRIAL_REQUEST_CAP/);
});

test('incomplete and unknown outcomes are failures, never successes, without retry', async () => {
  const incomplete = await runTrial({
    mode: 'live', confirmation: liveConfirmation(), projectId: 'proj_test12345',
    credentialProvider: mockCredential, caseId: 'landyachtz-the-clark', language: 'zh-TW',
    fetchImpl: async () => ({ok: true, status: 200, headers: {get: () => null},
      json: async () => ({id: 'resp_inc', status: 'incomplete',
        incomplete_details: {reason: 'max_output_tokens'}, output: [],
        usage: {input_tokens: 100, output_tokens: 3000}})}),
  });
  assert.equal(incomplete.status, 'LIVE_FAILED');
  assert.match(incomplete.failure.error, /OPENAI_INCOMPLETE/);
  assert.equal(incomplete.attempts[0].outcome, 'parse_failed');
  assert.equal(incomplete.requests, 1);

  let calls = 0;
  const unknown = await runTrial({
    mode: 'live', confirmation: liveConfirmation(), projectId: 'proj_test12345',
    credentialProvider: mockCredential, caseId: 'landyachtz-the-clark', language: 'zh-TW',
    fetchImpl: async () => { calls++; throw Error('socket reset'); },
  });
  assert.equal(unknown.status, 'LIVE_FAILED');
  assert.match(unknown.failure.error, /UNKNOWN_OUTCOME/);
  assert.equal(calls, 1);
  assert.equal(unknown.attempts[0].outcome, 'UNKNOWN_OUTCOME');
  // Cost is explicitly incomplete, never presented as a zero total.
  assert.equal(unknown.total_cost_usd, null);
  assert.equal(unknown.known_cost_usd, 0);
  assert.equal(unknown.unknown_cost_attempts, 1);
  assert.equal(unknown.cost_complete, false);
  assert.equal(unknown.cost_status, 'PENDING_RECONCILIATION');
});

test('a later case failure preserves all earlier completed results', async () => {
  const mockFetch = createMockFetch();
  let calls = 0;
  const summary = await runTrial({
    mode: 'mock', credentialProvider: mockCredential,
    fetchImpl: async (url, options) => {
      calls++;
      if (calls <= 2) return mockFetch(url, options);
      return {ok: false, status: 401, headers: {get: () => null},
        json: async () => ({error: {code: 'invalid_api_key', type: 'invalid_request_error'}})};
    },
  });
  assert.equal(summary.status, 'MOCK_FAILED');
  assert.equal(summary.results.filter(r => r.status !== 'FAILED').length, 2);
  assert.equal(summary.results.at(-1).status, 'FAILED');
  assert.equal(summary.audit.filter(a => a.status !== 'FAILED').length, 2);
  assert.equal(summary.attempted_requests, 3);
});

test('unknown case selection is refused before any fetch', async () => {
  let calls = 0;
  await assert.rejects(runTrial({
    mode: 'mock', credentialProvider: mockCredential, caseId: 'no-such-case',
    fetchImpl: async () => { calls++; },
  }), /CASE_NOT_FOUND/);
  assert.equal(calls, 0);
});

test('owner stop switch halts live path before further requests', async () => {
  let fetchCalls = 0;
  const summary = await runTrial({
    mode: 'live', confirmation: liveConfirmation(), projectId: 'proj_test12345',
    credentialProvider: mockCredential, shouldStop: () => true,
    fetchImpl: async () => { fetchCalls++; throw Error('must not be called'); },
  });
  assert.equal(summary.status, 'LIVE_STOPPED');
  assert.equal(summary.requests, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(summary.live_enabled_after_run, false);
});

test('CLI parsing rejects invalid request caps and defaults to mock', () => {
  assert.equal(parseCliArgs([]).mode, 'mock');
  assert.equal(parseCliArgs(['--live']).mode, 'live');
  assert.throws(() => parseCliArgs(['--max-requests=13']), /INVALID_MAX_REQUESTS/);
  assert.throws(() => parseCliArgs(['--max-requests=abc']), /INVALID_MAX_REQUESTS/);
  const single = parseCliArgs(['--live', '--case=landyachtz-the-clark', '--language=zh-TW', '--max-requests=1']);
  assert.equal(single.caseId, 'landyachtz-the-clark');
  assert.equal(single.language, 'zh-TW');
  assert.equal(single.maxRequests, 1);
});

test('missing credential provider is refused before any request', async () => {
  await assert.rejects(runTrial({mode: 'mock'}), /CREDENTIAL_PROVIDER_REQUIRED/);
});

test('mock trial runs all fixtures in both languages with zero real calls', async () => {
  const summary = await runTrial({mode: 'mock', credentialProvider: mockCredential});
  assert.equal(summary.status, 'MOCK_PASS');
  assert.equal(summary.real_api_calls, 0);
  assert.equal(summary.results.length, 6); // 3 cases x zh-TW/en
  assert.equal(summary.requests, 6);
  assert.ok(summary.total_cost_usd > 0 && summary.total_cost_usd <= 5);
  assert.ok(summary.results.every(r => r.status !== 'FAIL_CLOSED'));
  assert.ok(!JSON.stringify(summary).includes('mock-credential'));
});

test('trial caps: attempt limit stops the run but preserves completed results', async () => {
  const budget = createTrialBudget({trialCapUsd: 5, maxRequests: 2});
  const summary = await runTrial({mode: 'mock', credentialProvider: mockCredential, budget});
  assert.equal(summary.status, 'MOCK_FAILED');
  assert.match(summary.failure.error, /TRIAL_REQUEST_CAP/);
  assert.equal(budget.entries.length, 2);
  assert.equal(summary.results.filter(r => r.status !== 'FAILED').length, 2);
  assert.equal(summary.results.at(-1).status, 'FAILED');
  assert.equal(summary.audit.filter(a => a.status !== 'FAILED').length, 2);
});

test('keychain provider uses the approved identity and stays in memory only', async () => {
  const seen = [];
  const provider = createKeychainCredentialProvider({
    execFileImpl: async (file, args) => { seen.push([file, args]); return 'fake-secret-for-test\n'; },
  });
  const value = await provider();
  assert.equal(value, 'fake-secret-for-test');
  assert.deepEqual(seen, [['security', ['find-generic-password', '-a', 'growth-os-phase3b',
    '-s', 'openai-project-key', '-w']]]);

  // The credential reaches the (mock) transport header but never the
  // trial output, ledger or results.
  let header;
  const summary = await runTrial({
    mode: 'mock', credentialProvider: provider,
    fetchImpl: async (_url, options) => {
      header = options.headers.authorization;
      return {ok: true, status: 200, headers: {get: () => null}, json: async () => ({
        output_text: JSON.stringify({
          title: {text: 'The Clark', used_fact_ids: ['title']},
          meta_description: {text: 'x', used_fact_ids: ['description']},
          description: {text: 'The Clark', used_fact_ids: ['description']},
          geo_qa: [{question: 'q', answer: 'The Clark', used_fact_ids: ['description']}]}),
        usage: {input_tokens: 10, output_tokens: 10}})};
    },
  });
  assert.equal(header, 'Bearer fake-secret-for-test');
  assert.ok(!JSON.stringify(summary).includes('fake-secret'));
});
