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
import {createOpenAiTransport, createTrialBudget, OPENAI_MODEL, TRIAL_TOKEN_CAPS} from './openai-live-gate.mjs';
import {buildSeoRequest} from './model-adapter.mjs';
import {trustedFacts} from './ai-seo-pipeline.mjs';
import {evaluateGeneration, validateFixtureBindings} from './quality-eval.mjs';
import {createBatchLedger, enableBatchLedger, openBatchLedger, reconcileBatchLedger} from './batch-authorization.mjs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
    // A correct model never cites an UNRESOLVED conflicting fact as
    // settled: fall back to the non-conflicting product name instead.
    const conflicted = facts.description?.verification === 'conflicting';
    const description = conflicted
      ? (facts.product_name?.value ?? '') : (facts.description?.value ?? '');
    const descriptionIds = conflicted ? ['product_name'] : ['description'];
    const meta = facts.meta_description?.value ?? description;
    const title = facts.title?.value ?? facts.product_name?.value ?? '';
    return {
      ok: true, status: 200, headers: {get: () => null},
      json: async () => ({
        output_text: JSON.stringify({
          title: {text: title, used_fact_ids: ['title']},
          meta_description: {text: meta, used_fact_ids: [facts.meta_description?.value ? 'meta_description' : descriptionIds[0]]},
          description: {text: description, used_fact_ids: descriptionIds},
          geo_qa: [{question: 'What is it?', answer: description, used_fact_ids: descriptionIds}],
        }),
        usage: {input_tokens: 1000, output_tokens: 500},
      }),
    };
  };
}

export async function runTrial({
  mode = 'mock', credentialProvider, fetchImpl, budget,
  confirmation, projectId, shouldStop, caseId, language,
  batchFile, batchLedger,
} = {}) {
  if (mode !== 'mock' && mode !== 'live') throw Error('Unknown mode: ' + mode);
  const useBatch = batchFile != null || batchLedger != null;
  if (useBatch && mode !== 'live') throw Error('BATCH_REQUIRES_LIVE: batch authorization only applies to live mode');
  let trialBudget = useBatch ? null : validateLiveBudget(budget ?? createTrialBudget({}));
  let ledger = null;

  if (mode === 'live') {
    // All authorization checks run before any credential or fetch use.
    if (useBatch) {
      validateProjectId(projectId);
      ledger = batchLedger ?? openBatchLedger({file: batchFile, repoRoot: REPO_ROOT});
      const batch = ledger.validateFor({projectId, caseId, language});
      // The local budget can never widen the batch: an injected budget
      // above the batch limits is refused, and the default local
      // budget is created from the batch limits themselves.
      if (budget) {
        if (budget.cap > batch.budget_cap_usd || (budget.maxRequests ?? Infinity) > batch.max_attempts) {
          throw Error('BATCH_BUDGET_EXCEEDS_BATCH_LIMIT: injected budget widens the batch authorization');
        }
        trialBudget = budget;
      } else {
        trialBudget = createTrialBudget({
          trialCapUsd: batch.budget_cap_usd, maxRequests: batch.max_attempts});
      }
    } else {
      consumeLiveConfirmation(confirmation);
      validateProjectId(projectId);
    }
    if (typeof credentialProvider !== 'function') throw Error('CREDENTIAL_PROVIDER_REQUIRED');
  }
  if (mode === 'mock' && typeof credentialProvider !== 'function') {
    throw Error('CREDENTIAL_PROVIDER_REQUIRED');
  }

  const allCases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
  // Case and language selection are separate from the HTTP attempt
  // cap: selecting one case/language ends normally after that scope,
  // while --max-requests only limits actual HTTP sends.
  if (caseId != null && !allCases.cases.some(c => c.id === caseId)) {
    throw Error('CASE_NOT_FOUND: ' + String(caseId).slice(0, 64));
  }
  if (language != null && language !== 'zh-TW' && language !== 'en') {
    throw Error('LANGUAGE_NOT_SUPPORTED: ' + String(language).slice(0, 32));
  }
  const selectedCases = caseId ? allCases.cases.filter(c => c.id === caseId) : allCases.cases;
  const selectedLanguages = language ? [language] : ['zh-TW', 'en'];
  const isPartialScope = selectedCases.length !== allCases.cases.length
    || selectedLanguages.length !== 2;
  const cases = {cases: selectedCases};
  if (ledger) ledger.validateFor({projectId, caseId, language});
  // In batch mode every HTTP send (including retries) first reserves
  // an attempt in the persistent ledger; reservation happens inside
  // recordAttempt, immediately before the fetch is issued.
  let lastPreflightEstimate = 0;
  let reservedCostUsd = 0;
  const effectiveBudget = ledger ? {
    ...trialBudget,
    entries: trialBudget.entries,
    attempts: trialBudget.attempts,
    preflight: (args) => {
      lastPreflightEstimate = trialBudget.preflight(args);
      return lastPreflightEstimate;
    },
    record: (args) => trialBudget.record(args),
    recordAttempt: (fields) => {
      ledger.reserveAttempt({estimatedCostUsd: lastPreflightEstimate});
      reservedCostUsd += lastPreflightEstimate;
      return trialBudget.recordAttempt(fields);
    },
    updateAttempt: (attempt, fields) => trialBudget.updateAttempt(attempt, fields),
  } : trialBudget;
  const transport = createOpenAiTransport({
    enabled: true, // gate open only around the injected/controlled fetch
    credentialProvider,
    fetchImpl: fetchImpl ?? (mode === 'mock' ? createMockFetch() : globalThis.fetch),
    budget: effectiveBudget,
  });

  const results = [];
  const audit = [];
  let stoppedByOwner = false;
  let failure = null;
  outer: for (const testCase of cases.cases) {
    const bindingProblems = validateFixtureBindings(testCase);
    if (bindingProblems.length > 0) {
      results.push({case: testCase.id, status: 'FAIL_CLOSED', problems: bindingProblems});
      continue;
    }
    for (const language of selectedLanguages) {
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
      const batchAttemptsBefore = trialBudget.attempts.length;
      const batchSpentBefore = trialBudget.spent();
      const batchReservedBefore = reservedCostUsd;
      const settleBatchRequest = (unknownOutcome) => {
        if (!ledger) return;
        ledger.settleRun({
          attemptCount: trialBudget.attempts.length - batchAttemptsBefore,
          knownCostDelta: trialBudget.spent() - batchSpentBefore,
          reservedCostUsd: reservedCostUsd - batchReservedBefore,
          unknownOutcome});
      };
      let response;
      try {
        response = await transport({
          ...request, max_output_tokens: TRIAL_TOKEN_CAPS.outputPerRequest});
      } catch (error) {
        settleBatchRequest(
          trialBudget.attempts.slice(batchAttemptsBefore)
            .some(a => a.outcome === 'UNKNOWN_OUTCOME'));
        // Fail closed, but preserve every completed result and the
        // safe diagnostics of the failed request in the summary.
        failure = {
          case: testCase.id, language,
          error: String(error.message ?? error),
          api_error: error.apiError ?? null,
          usage: error.usage ?? null,
        };
        results.push({case: testCase.id, language, status: 'FAILED',
          error: failure.error, api_error: failure.api_error});
        audit.push({
          at: new Date().toISOString(), mode, case: testCase.id, language,
          model: OPENAI_MODEL.snapshot, project_id: mode === 'live' ? projectId : null,
          status: 'FAILED', api_error: failure.api_error,
          input_tokens: error.usage?.input_tokens ?? null,
          output_tokens: error.usage?.output_tokens ?? null,
          cost_usd: error.usage?.cost ?? null,
          usage_reported: error.usage?.usage_reported ?? null,
        });
        break outer;
      }
      settleBatchRequest(false);
      const evaluation = evaluateGeneration({report: testCase.report, suggestions: response.suggestions});
      results.push({case: testCase.id, language, status: evaluation.status,
        problems: evaluation.problems, unknown_facts: evaluation.unknown_facts,
        used_fact_ids: Object.fromEntries(
          Object.entries(response.suggestions ?? {})
            .filter(([, v]) => v && typeof v === 'object' && 'used_fact_ids' in v)
            .map(([field, v]) => [field, v.used_fact_ids ?? []])),
        geo_qa_used_fact_ids: (response.suggestions?.geo_qa ?? []).map(qa => qa?.used_fact_ids ?? []),
        fact_citation_map: request.fact_citation_map});
      audit.push({
        at: new Date().toISOString(), mode, case: testCase.id, language,
        model: OPENAI_MODEL.snapshot, project_id: mode === 'live' ? projectId : null,
        status: evaluation.status, input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens, cost_usd: response.usage.cost,
        usage_reported: response.usage.usage_reported ?? null,
      });
    }
  }
  const failed = results.some(r => r.status === 'FAIL_CLOSED');
  let batchState = null;
  if (ledger) {
    // Requests settle individually above; a crash between reserve and
    // settle therefore leaves pending state that blocks later runs.
    if (stoppedByOwner) ledger.stop('owner stop switch activated');
    const settled = ledger.snapshot();
    batchState = {
      batch_id: settled.batch_id, status: settled.status,
      attempts_used: settled.attempts_used, max_attempts: settled.max_attempts,
      known_cost_usd: settled.known_cost_usd, budget_cap_usd: settled.budget_cap_usd,
      unknown_cost_attempts: settled.unknown_cost_attempts,
      expires_at: settled.expires_at,
    };
  }
  return {
    mode,
    status: failure ? (mode === 'live' ? 'LIVE_FAILED' : 'MOCK_FAILED')
      : stoppedByOwner ? (mode === 'live' ? 'LIVE_STOPPED' : 'MOCK_STOPPED')
      : failed ? (mode === 'live' ? 'LIVE_FAIL_CLOSED' : 'MOCK_FAIL_CLOSED')
        : (mode === 'live' ? 'LIVE_PASS' : 'MOCK_PASS'),
    failure,
    acceptance_scope: isPartialScope ? 'PARTIAL_SELECTION' : 'FULL_6_RESULTS',
    selected_case: caseId ?? null,
    selected_language: language ?? null,
    selected_cases: selectedCases.length,
    selected_languages: selectedLanguages,
    real_api_calls: mode === 'live' ? trialBudget.attempts.length : 0,
    attempted_requests: trialBudget.attempts.length,
    attempts: trialBudget.attempts,
    results,
    audit,
    requests: trialBudget.entries.length,
    known_cost_usd: trialBudget.spent(),
    unknown_cost_attempts: trialBudget.attempts.filter(a => a.outcome === 'UNKNOWN_OUTCOME').length,
    cost_complete: !trialBudget.attempts.some(a => a.outcome === 'UNKNOWN_OUTCOME'),
    cost_status: trialBudget.attempts.some(a => a.outcome === 'UNKNOWN_OUTCOME')
      ? 'PENDING_RECONCILIATION' : 'COMPLETE',
    total_cost_usd: trialBudget.attempts.some(a => a.outcome === 'UNKNOWN_OUTCOME')
      ? null : trialBudget.spent(),
    budget_cap_usd: trialBudget.cap,
    token_caps: TRIAL_TOKEN_CAPS,
    stopped: trialBudget.stopped,
    live_enabled_after_run: false,
    batch: batchState,
    authorization_consumed: mode === 'live' && !ledger,
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
  const batchHoursRaw = get('--batch-hours');
  const batchHours = batchHoursRaw === undefined ? 24 : Number(batchHoursRaw);
  if (!Number.isFinite(batchHours) || batchHours < 1 || batchHours > 168) {
    throw Error('INVALID_BATCH_HOURS: must be from 1 to 168');
  }
  return {
    mode: argv.includes('--live') ? 'live' : 'mock',
    projectId: get('--project-id'),
    confirmation: get('--confirm-live'),
    stopFile: get('--stop-file'),
    caseId: get('--case'),
    language: get('--language'),
    batchFile: get('--batch-file'),
    createBatch: argv.includes('--create-batch'),
    enableBatch: argv.includes('--enable-batch'),
    reconcileBatch: argv.includes('--reconcile-batch'),
    batchConfirmation: get('--confirm-batch'),
    stopBatch: argv.includes('--stop-batch'),
    batchHours,
    maxRequests,
  };
}

const isMain = import.meta.url === new URL(process.argv[1], 'file:').href
  || process.argv[1]?.endsWith('run-phase3b-trial.mjs');
if (isMain) {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
    if (cli.createBatch || cli.enableBatch || cli.reconcileBatch || cli.stopBatch) {
      if (!cli.batchFile) throw Error('BATCH_FILE_REQUIRED');
      if (cli.createBatch) {
        const created = createBatchLedger({
          file: cli.batchFile, repoRoot: REPO_ROOT,
          projectId: cli.projectId, expiresInHours: cli.batchHours});
        console.log(JSON.stringify({status: 'BATCH_CREATED_INACTIVE', batch_id: created.batch_id,
          project_id: created.project_id, model: created.model,
          max_attempts: created.max_attempts, budget_cap_usd: created.budget_cap_usd,
          expires_at: created.expires_at, batch_file: cli.batchFile}, null, 1));
      } else if (cli.enableBatch) {
        const enabled = enableBatchLedger({
          file: cli.batchFile, repoRoot: REPO_ROOT, confirmation: cli.batchConfirmation});
        console.log(JSON.stringify({status: 'BATCH_ENABLED', batch_id: enabled.batch_id,
          batch_status: enabled.status, expires_at: enabled.expires_at}, null, 1));
      } else if (cli.reconcileBatch) {
        const reconciled = reconcileBatchLedger({
          file: cli.batchFile, repoRoot: REPO_ROOT, confirmation: cli.batchConfirmation});
        console.log(JSON.stringify({status: 'BATCH_RECONCILED_STOPPED', batch_id: reconciled.batch_id,
          batch_status: reconciled.status, unknown_cost_attempts: reconciled.unknown_cost_attempts}, null, 1));
      } else {
        const stopped = openBatchLedger({file: cli.batchFile, repoRoot: REPO_ROOT})
          .stop('owner stop command');
        console.log(JSON.stringify({status: 'BATCH_STOPPED', batch_id: stopped.batch_id,
          batch_status: stopped.status}, null, 1));
      }
      process.exit(0);
    }
    const summary = await runTrial({
      mode: cli.mode,
      projectId: cli.projectId,
      confirmation: cli.confirmation,
      caseId: cli.caseId,
      language: cli.language,
      batchFile: cli.batchFile,
      budget: cli.maxRequests ? createTrialBudget({maxRequests: cli.maxRequests}) : undefined,
      shouldStop: cli.stopFile ? () => existsSync(cli.stopFile) : undefined,
      credentialProvider: cli.mode === 'live'
        ? createKeychainCredentialProvider()
        : async () => 'mock-credential-not-real',
    });
    console.log(JSON.stringify(summary, null, 1));
    if (summary.status.endsWith('FAIL_CLOSED') || summary.status.endsWith('FAILED')) process.exit(1);
  } catch (error) {
    console.error(JSON.stringify({
      mode: cli?.mode ?? 'unknown', status: 'REFUSED',
      live_enabled_after_run: false,
      error: String(error.message ?? error),
      api_error: error.apiError ?? null,
      attempted_requests: error.attemptedRequests ?? 0,
      attempts: error.trialAttempts ?? [],
      total_cost_usd: error.totalCostUsd ?? 0,
    }));
    process.exit(2);
  }
}
