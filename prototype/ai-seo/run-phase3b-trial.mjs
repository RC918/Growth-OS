// Phase 3B macOS local trial entry.
//
// Owner Mac native terminal (mock, no network, no keychain read):
//   node prototype/ai-seo/run-phase3b-trial.mjs --mock
//
// Live mode is disabled by default. It becomes available only inside
// one process invocation when the Owner supplies all of:
//   --live
//   --project-id=proj_...
//   --confirm-live=PHASE3B-LIVE-ONCE:<single-use nonce, >=12 chars>
// A confirmation nonce can be consumed once in a process and is never
// persisted; when the process exits, live is disabled again. The mere
// presence of a keychain item or environment variable never enables it.
// In live mode the credential is read through the macOS keychain
// provider, exists only in process memory, and is never printed,
// logged, written to an audit record or persisted.

import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createOpenAiTransport, createTrialBudget, OPENAI_MODEL} from './openai-live-gate.mjs';
import {buildSeoRequest} from './model-adapter.mjs';
import {trustedFacts} from './ai-seo-pipeline.mjs';
import {evaluateGeneration, validateFixtureBindings} from './quality-eval.mjs';

export const KEYCHAIN_IDENTITY = {account: 'growth-os-phase3b', service: 'openai-project-key'};
export const LIVE_CONFIRMATION_PREFIX = 'PHASE3B-LIVE-ONCE:';
export const LIVE_LIMITS = {maxRequests: 12, trialCapUsd: 5, model: OPENAI_MODEL.snapshot};

const consumedLiveConfirmations = new Set();

export function consumeLiveConfirmation(confirmation) {
  if (typeof confirmation !== 'string' || !confirmation.startsWith(LIVE_CONFIRMATION_PREFIX)) {
    throw Error('LIVE_NOT_AUTHORIZED: Owner single-use live confirmation required');
  }
  const nonce = confirmation.slice(LIVE_CONFIRMATION_PREFIX.length);
  if (nonce.length < 12) throw Error('LIVE_NOT_AUTHORIZED: live confirmation nonce too short');
  if (consumedLiveConfirmations.has(nonce)) {
    throw Error('LIVE_NOT_AUTHORIZED: live confirmation already consumed');
  }
  consumedLiveConfirmations.add(nonce);
  return true;
}

export function validateProjectId(projectId) {
  if (typeof projectId !== 'string' || !/^proj_[A-Za-z0-9][A-Za-z0-9_-]{7,}$/.test(projectId)) {
    throw Error('PROJECT_ID_REQUIRED: valid non-secret OpenAI project id (proj_...) required');
  }
  return projectId;
}

export function validateLiveBudget(budget) {
  if (budget.cap > LIVE_LIMITS.trialCapUsd) throw Error('TRIAL_BUDGET_CAP exceeds Phase 3B US$5 limit');
  if ((budget.maxRequests ?? LIVE_LIMITS.maxRequests) > LIVE_LIMITS.maxRequests) {
    throw Error('TRIAL_REQUEST_CAP exceeds Phase 3B 12-request limit');
  }
  return budget;
}

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

export async function runTrial({
  mode = 'mock', credentialProvider, fetchImpl, budget,
  confirmation, projectId, shouldStop,
} = {}) {
  if (mode !== 'mock' && mode !== 'live') throw Error('Unknown mode: ' + mode);
  const trialBudget = validateLiveBudget(budget ?? createTrialBudget({}));

  if (mode === 'live') {
    // All authorization checks run before any credential or fetch use.
    consumeLiveConfirmation(confirmation);
    validateProjectId(projectId);
    if (typeof credentialProvider !== 'function') throw Error('CREDENTIAL_PROVIDER_REQUIRED');
  }
  if (mode === 'mock' && typeof credentialProvider !== 'function') {
    throw Error('CREDENTIAL_PROVIDER_REQUIRED');
  }

  const cases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
  const transport = createOpenAiTransport({
    enabled: true, // gate open only around the injected/controlled fetch
    credentialProvider,
    fetchImpl: fetchImpl ?? (mode === 'mock' ? createMockFetch() : globalThis.fetch),
    budget: trialBudget,
  });

  const results = [];
  const audit = [];
  let stoppedByOwner = false;
  outer: for (const testCase of cases.cases) {
    const bindingProblems = validateFixtureBindings(testCase);
    if (bindingProblems.length > 0) {
      results.push({case: testCase.id, status: 'FAIL_CLOSED', problems: bindingProblems});
      continue;
    }
    for (const language of ['zh-TW', 'en']) {
      if (typeof shouldStop === 'function' && shouldStop()) {
        trialBudget.stop('owner stop switch activated');
        stoppedByOwner = true;
        break outer;
      }
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
      audit.push({
        at: new Date().toISOString(), mode, case: testCase.id, language,
        model: OPENAI_MODEL.snapshot, project_id: mode === 'live' ? projectId : null,
        status: evaluation.status, input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens, cost_usd: response.usage.cost,
      });
    }
  }
  const failed = results.some(r => r.status === 'FAIL_CLOSED');
  return {
    mode,
    status: stoppedByOwner ? (mode === 'live' ? 'LIVE_STOPPED' : 'MOCK_STOPPED')
      : failed ? (mode === 'live' ? 'LIVE_FAIL_CLOSED' : 'MOCK_FAIL_CLOSED')
        : (mode === 'live' ? 'LIVE_PASS' : 'MOCK_PASS'),
    real_api_calls: mode === 'live' ? trialBudget.entries.length : 0,
    results,
    audit,
    requests: trialBudget.entries.length,
    total_cost_usd: trialBudget.spent(),
    budget_cap_usd: trialBudget.cap,
    stopped: trialBudget.stopped,
    live_enabled_after_run: false,
    authorization_consumed: mode === 'live',
    model_permission_evidence: mode === 'live'
      ? 'first API response or API error for the pinned model; not verified offline'
      : 'not applicable in mock mode',
  };
}

export function parseCliArgs(argv) {
  const get = (name) => {
    const item = argv.find(a => a.startsWith(name + '='));
    return item ? item.slice(name.length + 1) : undefined;
  };
  const maxRequestsRaw = get('--max-requests');
  const maxRequests = maxRequestsRaw === undefined ? undefined : Number(maxRequestsRaw);
  if (maxRequests !== undefined && (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 12)) {
    throw Error('INVALID_MAX_REQUESTS: must be an integer from 1 to 12');
  }
  return {
    mode: argv.includes('--live') ? 'live' : 'mock',
    projectId: get('--project-id'),
    confirmation: get('--confirm-live'),
    stopFile: get('--stop-file'),
    maxRequests,
  };
}

const isMain = import.meta.url === new URL(process.argv[1], 'file:').href
  || process.argv[1]?.endsWith('run-phase3b-trial.mjs');
if (isMain) {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
    const summary = await runTrial({
      mode: cli.mode,
      projectId: cli.projectId,
      confirmation: cli.confirmation,
      budget: cli.maxRequests ? createTrialBudget({maxRequests: cli.maxRequests}) : undefined,
      shouldStop: cli.stopFile ? () => existsSync(cli.stopFile) : undefined,
      credentialProvider: cli.mode === 'live'
        ? createKeychainCredentialProvider()
        : async () => 'mock-credential-not-real',
    });
    console.log(JSON.stringify(summary, null, 1));
    if (summary.status.endsWith('FAIL_CLOSED')) process.exit(1);
  } catch (error) {
    console.error(JSON.stringify({
      mode: cli?.mode ?? 'unknown', status: 'REFUSED',
      live_enabled_after_run: false,
      error: String(error.message ?? error),
    }));
    process.exit(2);
  }
}
