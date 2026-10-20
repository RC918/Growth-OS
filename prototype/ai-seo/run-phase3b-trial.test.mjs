import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeychainCredentialProvider, runTrial} from './run-phase3b-trial.mjs';
import {createTrialBudget} from './openai-live-gate.mjs';

const mockCredential = async () => 'mock-credential-not-real';

test('live mode is refused without and even with an enable flag in this build', async () => {
  await assert.rejects(runTrial({mode: 'live', credentialProvider: mockCredential}),
    /LIVE_NOT_AUTHORIZED/);
  await assert.rejects(runTrial({mode: 'live', enableLive: true, credentialProvider: mockCredential}),
    /LIVE_NOT_AUTHORIZED/);
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

test('trial caps: request limit and budget stop the run', async () => {
  const budget = createTrialBudget({trialCapUsd: 5, maxRequests: 2});
  await assert.rejects(
    runTrial({mode: 'mock', credentialProvider: mockCredential, budget}),
    /TRIAL_REQUEST_CAP/);
  assert.equal(budget.entries.length, 2);
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
