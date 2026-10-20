// Phase 3B macOS local trial entry (MOCK ONLY in this build).
//
// Run on the Owner's Mac in a native terminal:
//   node prototype/ai-seo/run-phase3b-trial.mjs --mock
//
// Safety contract:
// - Mock mode uses a local fake fetch and a mock credential. It can
//   never reach the network: no real fetch implementation is wired.
// - Live mode is refused in this build (LIVE_NOT_AUTHORIZED). A
//   future Owner authorization must separately enable it; the mere
//   presence of a keychain item or environment variable never does.
// - The future keychain credential provider is designed here but is
//   NOT executed by this entry in mock mode. Tests inject a mock
//   keychain response; the credential exists only in process memory
//   and is never printed, logged or persisted.

import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createOpenAiTransport, createTrialBudget} from './openai-live-gate.mjs';
import {buildSeoRequest} from './model-adapter.mjs';
import {trustedFacts} from './ai-seo-pipeline.mjs';
import {evaluateGeneration, validateFixtureBindings} from './quality-eval.mjs';

export const KEYCHAIN_IDENTITY = {account: 'growth-os-phase3b', service: 'openai-project-key'};

// Future live credential provider (designed, not used by mock mode).
// The real execFile call reads the macOS keychain item into memory;
// tests replace execFileImpl with a mock and assert redaction.
export function createKeychainCredentialProvider({execFileImpl} = {}) {
  const run = execFileImpl ?? ((file, args) => new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout) => error ? reject(error) : resolve(stdout));
  }));
  return async () => {
    const value = String(await run('security', [
      'find-generic-password', '-a', KEYCHAIN_IDENTITY.account,
      '-s', KEYCHAIN_IDENTITY.service, '-w'])).trim();
    if (!value) throw Error('KEYCHAIN_CREDENTIAL_MISSING');
    return value;
  };
}

// Deterministic offline suggestions built only from trusted facts,
// shaped like a Responses API payload so the real gate, budget and
// error paths are exercised without any network call.
export function createMockFetch() {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    const {facts} = JSON.parse(body.input[1].content);
    const description = facts.description?.value ?? '';
    const meta = facts.meta_description?.value ?? description;
    const title = facts.title?.value ?? facts.product_name?.value ?? '';
    return {
      ok: true, status: 200, headers: {get: () => null},
      json: async () => ({
        output_text: JSON.stringify({
          title: {text: title, used_fact_ids: ['title']},
          meta_description: {text: meta, used_fact_ids: [facts.meta_description?.value ? 'meta_description' : 'description']},
          description: {text: description, used_fact_ids: ['description']},
          geo_qa: [{question: 'What is it?', answer: description, used_fact_ids: ['description']}],
        }),
        usage: {input_tokens: 1000, output_tokens: 500},
      }),
    };
  };
}

export async function runTrial({mode = 'mock', enableLive = false, credentialProvider, fetchImpl, budget} = {}) {
  if (mode === 'live') {
    // This build has no authorized live path at all. Enabling needs a
    // separate, explicit Owner authorization plus code review; it is
    // never inferred from keychain or environment state.
    if (enableLive !== true) throw Error('LIVE_NOT_AUTHORIZED: Owner enable decision required');
    throw Error('LIVE_NOT_AUTHORIZED: live path not enabled in this build');
  }
  if (mode !== 'mock') throw Error('Unknown mode: ' + mode);
  if (typeof credentialProvider !== 'function') throw Error('CREDENTIAL_PROVIDER_REQUIRED');

  const cases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
  const trialBudget = budget ?? createTrialBudget({});
  const transport = createOpenAiTransport({
    enabled: true, // gate open only around the injected mock fetch
    credentialProvider,
    fetchImpl: fetchImpl ?? createMockFetch(),
    budget: trialBudget,
  });

  const results = [];
  for (const testCase of cases.cases) {
    const bindingProblems = validateFixtureBindings(testCase);
    if (bindingProblems.length > 0) {
      results.push({case: testCase.id, status: 'FAIL_CLOSED', problems: bindingProblems});
      continue;
    }
    for (const language of ['zh-TW', 'en']) {
      const facts = trustedFacts(testCase.report);
      const known = Object.fromEntries(Object.entries(facts).filter(([, f]) => f.value));
      const request = buildSeoRequest({
        facts: known, market: language === 'en' ? 'US' : 'TW', language,
        fields: ['title', 'meta_description', 'description'],
      });
      const response = await transport({
        ...request, estimated_input_tokens: 1200, max_output_tokens: 800});
      const evaluation = evaluateGeneration({report: testCase.report, suggestions: response.suggestions});
      results.push({case: testCase.id, language, status: evaluation.status,
        problems: evaluation.problems, unknown_facts: evaluation.unknown_facts});
    }
  }
  const failed = results.some(r => r.status === 'FAIL_CLOSED');
  return {
    mode: 'mock',
    status: failed ? 'MOCK_FAIL_CLOSED' : 'MOCK_PASS',
    real_api_calls: 0,
    results,
    requests: trialBudget.entries.length,
    total_cost_usd: trialBudget.spent(),
    budget_cap_usd: trialBudget.cap,
    stopped: trialBudget.stopped,
  };
}

const isMain = import.meta.url === new URL(process.argv[1], 'file:').href
  || process.argv[1]?.endsWith('run-phase3b-trial.mjs');
if (isMain) {
  const mode = process.argv.includes('--live') ? 'live' : 'mock';
  try {
    const summary = await runTrial({
      mode,
      credentialProvider: async () => 'mock-credential-not-real',
    });
    console.log(JSON.stringify(summary, null, 1));
  } catch (error) {
    console.error(JSON.stringify({mode, status: 'REFUSED', error: String(error.message ?? error)}));
    process.exit(2);
  }
}
