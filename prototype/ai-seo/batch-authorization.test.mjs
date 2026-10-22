import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {BATCH_ENABLE_CONFIRMATION, BATCH_LIMITS, BATCH_RECONCILE_CONFIRMATION, createBatchLedger, enableBatchLedger, openBatchLedger, reconcileBatchLedger} from './batch-authorization.mjs';
import {runTrial} from './run-phase3b-trial.mjs';

import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const makeBatch = (overrides = {}) => {
  const {enabled = true, ...createOverrides} = overrides;
  const dir = mkdtempSync(join(tmpdir(), 'phase3b-batch-'));
  const file = join(dir, 'batch.json');
  const created = createBatchLedger({file, repoRoot, projectId: 'proj_test12345', ...createOverrides});
  if (enabled) enableBatchLedger({file, repoRoot, confirmation: BATCH_ENABLE_CONFIRMATION});
  return {file, created, ledger: openBatchLedger({file, repoRoot})};
};
const mockCredential = async () => 'mock-credential-not-real';
let nonce = 0;
const confirmation = () => 'PHASE3B-LIVE-ONCE:batch-test-' + (++nonce) + '-abcdefghij';

test('batch ledger persists scope, limits and never stores secrets', () => {
  const {file, created} = makeBatch({enabled: false});
  assert.equal(created.status, 'inactive');
  assert.equal(created.owner_enabled, false);
  assert.equal(created.model, 'gpt-5-mini-2025-08-07');
  assert.equal(created.max_attempts, 6);
  assert.equal(created.budget_cap_usd, 0.10);
  assert.deepEqual(created.cases, BATCH_LIMITS.cases);
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('mock-credential'));
  assert.ok(!raw.includes('PHASE3B-LIVE-ONCE'));
  assert.ok(!raw.includes('sk-'));
  const reopened = openBatchLedger({file, repoRoot});
  assert.equal(reopened.snapshot().batch_id, created.batch_id);
});

test('batch creation works in a brand-new user directory and stays inactive', async () => {
  const base = mkdtempSync(join(tmpdir(), 'phase3b-batch-fresh-'));
  const file = join(base, 'brand', 'new', 'batch.json');
  const created = createBatchLedger({file, repoRoot, projectId: 'proj_test12345'});
  assert.equal(created.status, 'inactive');
  assert.equal(created.owner_enabled, false);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(file + '.auth-key').mode & 0o777, 0o600);
  assert.equal(openBatchLedger({file, repoRoot}).snapshot().attempts_used, 0);
  // Creating again must refuse without disturbing the existing ledger.
  const before = readFileSync(file, 'utf8');
  assert.throws(() => createBatchLedger({file, repoRoot, projectId: 'proj_test12345'}),
    /BATCH_ALREADY_EXISTS|BATCH_AUTH_KEY_EXISTS/);
  assert.equal(readFileSync(file, 'utf8'), before);
  // The fresh inactive batch still performs zero HTTP/credential calls.
  let fetchCalls = 0; let credentialCalls = 0;
  await assert.rejects(runTrial({
    mode: 'live', projectId: 'proj_test12345', batchFile: file,
    credentialProvider: async () => { credentialCalls++; return 'x'; },
    fetchImpl: async () => { fetchCalls++; }}), /BATCH_NOT_ENABLED/);
  assert.equal(fetchCalls, 0);
  assert.equal(credentialCalls, 0);
});

test('failed creation leaves no partial ledger and never removes a pre-existing key', () => {
  const base = mkdtempSync(join(tmpdir(), 'phase3b-batch-partial-'));
  const file = join(base, 'fresh', 'batch.json');
  // A pre-existing key at the fresh path must block creation and survive.
  mkdirSync(join(base, 'fresh'), {recursive: true});
  writeFileSync(file + '.auth-key', 'pre-existing-key-material', {mode: 0o600});
  assert.throws(() => createBatchLedger({file, repoRoot, projectId: 'proj_test12345'}),
    /BATCH_AUTH_KEY_EXISTS/);
  assert.equal(existsSync(file), false);
  assert.equal(readFileSync(file + '.auth-key', 'utf8'), 'pre-existing-key-material');
});

test('batch creation refuses repo-internal files and limit expansion', () => {
  assert.throws(() => createBatchLedger({
    file: join(repoRoot, 'batch.json'), repoRoot, projectId: 'proj_test12345'}),
    /BATCH_FILE_INSIDE_REPO/);
  const dir = mkdtempSync(join(tmpdir(), 'phase3b-batch-'));
  assert.throws(() => createBatchLedger({
    file: join(dir, 'b.json'), repoRoot, projectId: 'proj_test12345', maxAttempts: 7}),
    /BATCH_ATTEMPT_LIMIT_EXCEEDS_MAX/);
  assert.throws(() => createBatchLedger({
    file: join(dir, 'b.json'), repoRoot, projectId: 'proj_test12345', budgetCapUsd: 0.11}),
    /BATCH_BUDGET_LIMIT_EXCEEDS_MAX/);
});

test('reservations are persistent, capped and settled across reopen', () => {
  const {file, ledger} = makeBatch({maxAttempts: 2});
  assert.equal(ledger.reserveAttempt(), 1);
  assert.equal(ledger.reserveAttempt(), 2);
  assert.throws(() => ledger.reserveAttempt(), /BATCH_EXHAUSTED|BATCH_NOT_ACTIVE/);
  ledger.settleRun({attemptCount: 2, knownCostDelta: 0.01});
  const reopened = openBatchLedger({file, repoRoot});
  const state = reopened.snapshot();
  assert.equal(state.attempts_used, 2);
  assert.equal(state.known_cost_usd, 0.01);
  assert.equal(state.status, 'exhausted');
  assert.throws(() => reopened.reserveAttempt(), /BATCH_NOT_ACTIVE|BATCH_EXHAUSTED/);
});

test('expired, stopped and unknown-outcome batches fail closed', () => {
  const expired = makeBatch({expiresInHours: 1});
  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 3600_000;
  try { assert.throws(() => expired.ledger.reserveAttempt(), /BATCH_EXPIRED/); }
  finally { Date.now = realNow; }

  const stopped = makeBatch();
  stopped.ledger.stop('owner stop');
  assert.throws(() => stopped.ledger.reserveAttempt(), /BATCH_NOT_ACTIVE/);

  const unknown = makeBatch();
  unknown.ledger.reserveAttempt();
  unknown.ledger.settleRun({attemptCount: 1, unknownOutcome: true});
  assert.equal(unknown.ledger.snapshot().status, 'stopped_unknown_pending');
  assert.throws(() => unknown.ledger.reserveAttempt(), /BATCH_NOT_ACTIVE/);
});

test('concurrent processes cannot reserve beyond the batch cap', async () => {
  const {file} = makeBatch({maxAttempts: 6});
  const child = `
    import {openBatchLedger} from ${JSON.stringify(new URL('./batch-authorization.mjs', import.meta.url).href)};
    const ledger = openBatchLedger({file: ${JSON.stringify(file)}, repoRoot: ${JSON.stringify(repoRoot)}});
    let ok = 0;
    for (let i = 0; i < 5; i++) {
      try { ledger.reserveAttempt({estimatedCostUsd: 0.0001}); ledger.settleRun({attemptCount: 1, knownCostDelta: 0.0001, reservedCostUsd: 0.0001}); ok++; } catch {}
    }
    console.log(ok);
  `;
  const run = () => new Promise((resolve, reject) => {
    execFile(process.execPath, ['--input-type=module', '-e', child],
      (error, stdout) => error ? reject(error) : resolve(Number(stdout.trim())));
  });
  const counts = await Promise.all([run(), run(), run()]);
  assert.equal(counts.reduce((a, b) => a + b, 0), 6);
  assert.equal(openBatchLedger({file, repoRoot}).snapshot().attempts_used, 6);
});

test('batch live runs consume persistent attempts and stop on unknown outcome', async () => {
  const {file, ledger} = makeBatch();
  const successFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const {facts} = JSON.parse(body.input[1].content);
    const description = facts.description?.value ?? '';
    return {ok: true, status: 200, headers: {get: () => null}, json: async () => ({
      id: 'resp_batch', status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({
        title: {text: facts.title?.value ?? '', used_fact_ids: ['title']},
        meta_description: {text: description, used_fact_ids: ['description']},
        description: {text: description, used_fact_ids: ['description']},
        geo_qa: [{question: 'q', answer: description, used_fact_ids: ['description']}]})}]}],
      usage: {input_tokens: 100, output_tokens: 50}})};
  };
  const first = await runTrial({
    mode: 'live', projectId: 'proj_test12345', credentialProvider: mockCredential,
    batchFile: file, caseId: 'landyachtz-the-clark', language: 'zh-TW', fetchImpl: successFetch});
  assert.equal(first.status, 'LIVE_PASS');
  assert.equal(first.batch.attempts_used, 1);
  assert.equal(ledger.snapshot().attempts_used, 1);
  assert.ok(ledger.snapshot().known_cost_usd > 0);

  const unknown = await runTrial({
    mode: 'live', projectId: 'proj_test12345', credentialProvider: mockCredential,
    batchFile: file, caseId: 'landyachtz-the-clark', language: 'en',
    fetchImpl: async () => { throw Error('socket reset'); }});
  assert.equal(unknown.status, 'LIVE_FAILED');
  assert.equal(unknown.batch.status, 'stopped_unknown_pending');
  assert.equal(unknown.total_cost_usd, null);

  // A stopped batch refuses before any credential or fetch use.
  let credentialCalls = 0;
  await assert.rejects(runTrial({
    mode: 'live', projectId: 'proj_test12345', batchFile: file,
    credentialProvider: async () => { credentialCalls++; return 'x'; },
    fetchImpl: async () => { throw Error('must not run'); }}),
    /BATCH_NOT_ACTIVE/);
  assert.equal(credentialCalls, 0);
});

test('symlinked paths into the repo are rejected by canonical location', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phase3b-batch-link-'));
  const link = join(dir, 'repo-link');
  symlinkSync(repoRoot, link, 'dir');
  assert.throws(() => createBatchLedger({
    file: join(link, 'batch.json'), repoRoot, projectId: 'proj_test12345'}),
    /BATCH_FILE_INSIDE_REPO/);
});

test('batch budget cannot be widened by injection and stops before overspend', async () => {
  const {file, ledger} = makeBatch({budgetCapUsd: 0.001});
  let calls = 0;
  const summary = await runTrial({
    mode: 'live', projectId: 'proj_test12345', credentialProvider: mockCredential,
    batchFile: file, caseId: 'landyachtz-the-clark', language: 'zh-TW',
    fetchImpl: async () => { calls++; throw Error('must not run'); }});
  assert.equal(summary.status, 'LIVE_FAILED');
  assert.equal(calls, 0);
  assert.equal(ledger.snapshot().attempts_used, 0);

  const wide = makeBatch();
  const {createTrialBudget} = await import('./openai-live-gate.mjs');
  await assert.rejects(runTrial({
    mode: 'live', projectId: 'proj_test12345', credentialProvider: mockCredential,
    batchFile: wide.file, budget: createTrialBudget({trialCapUsd: 999, maxRequests: 99}),
    fetchImpl: async () => { throw Error('must not run'); }}),
    /BATCH_BUDGET_EXCEEDS_BATCH_LIMIT/);
  assert.equal(wide.ledger.snapshot().attempts_used, 0);
});

test('creation alone authorizes nothing; enable is explicit and not repeatable', async () => {
  const {file, ledger} = makeBatch({enabled: false});
  let fetchCalls = 0; let credentialCalls = 0;
  await assert.rejects(runTrial({
    mode: 'live', projectId: 'proj_test12345', batchFile: file,
    credentialProvider: async () => { credentialCalls++; return 'x'; },
    fetchImpl: async () => { fetchCalls++; }}), /BATCH_NOT_ENABLED/);
  assert.equal(fetchCalls, 0);
  assert.equal(credentialCalls, 0);
  assert.equal(ledger.snapshot().attempts_used, 0);

  assert.throws(() => enableBatchLedger({file, repoRoot, confirmation: 'yes'}),
    /BATCH_ENABLE_NOT_AUTHORIZED/);
  enableBatchLedger({file, repoRoot, confirmation: BATCH_ENABLE_CONFIRMATION});
  assert.throws(() => enableBatchLedger({file, repoRoot, confirmation: BATCH_ENABLE_CONFIRMATION}),
    /BATCH_ALREADY_ENABLED/);
});

test('unsettled reservations block recovery until Owner reconciliation, which stays stopped', () => {
  const {file, ledger} = makeBatch();
  ledger.reserveAttempt({estimatedCostUsd: 0.001});
  // Simulate a crash: no settleRun is ever called for this reserve.
  const reopened = openBatchLedger({file, repoRoot});
  assert.equal(reopened.snapshot().attempts_pending, 1);
  assert.throws(() => reopened.validateFor({projectId: 'proj_test12345'}), /BATCH_SETTLEMENT_PENDING/);
  assert.throws(() => reopened.reserveAttempt(), /BATCH_SETTLEMENT_PENDING/);
  assert.throws(() => reopened.settleRun({attemptCount: 1}), /BATCH_SETTLEMENT_PENDING/);
  assert.equal(reopened.snapshot().attempts_pending, 1);
  // Reconciliation requires the Owner phrase, converts the unsettled
  // attempt to unknown cost and never reactivates the batch.
  assert.throws(() => reconcileBatchLedger({file, repoRoot, confirmation: 'yes'}),
    /BATCH_RECONCILE_NOT_AUTHORIZED/);
  const reconciled = reconcileBatchLedger({file, repoRoot, confirmation: BATCH_RECONCILE_CONFIRMATION});
  assert.equal(reconciled.status, 'stopped_unknown_pending');
  assert.equal(reconciled.unknown_cost_attempts, 1);
  assert.equal(reconciled.attempts_pending, 0);
  assert.throws(() => reopened.reserveAttempt(), /BATCH_NOT_ACTIVE/);
});

test('a caller-supplied run id cannot impersonate the reserving process', () => {
  const {file, ledger} = makeBatch();
  ledger.reserveAttempt({estimatedCostUsd: 0.001});
  const other = openBatchLedger({file, repoRoot});
  const stolen = JSON.parse(readFileSync(file, 'utf8')).pending_run_id;
  assert.ok(stolen);
  assert.throws(() => other.reserveAttempt({estimatedCostUsd: 0.001, runId: stolen}),
    /BATCH_SETTLEMENT_PENDING/);
  assert.equal(other.snapshot().attempts_used, 1);
});

test('edits to an inactive ledger are detected before enable', () => {
  const {file} = makeBatch({enabled: false});
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  raw.project_id = 'proj_attacker99';
  writeFileSync(file + '.tmp', JSON.stringify(raw));
  renameSync(file + '.tmp', file);
  assert.throws(() => enableBatchLedger({file, repoRoot, confirmation: BATCH_ENABLE_CONFIRMATION}),
    /BATCH_LEDGER_TAMPERED|BATCH_LEDGER_INVALID/);
});

test('edited or copied-without-key ledgers are not valid authorization', () => {
  const {file} = makeBatch();
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  raw.attempts_used = 5;
  raw.budget_cap_usd = 0.10;
  writeFileSync(file + '.tmp', JSON.stringify(raw));
  renameSync(file + '.tmp', file);
  assert.throws(() => openBatchLedger({file, repoRoot}).snapshot(), /BATCH_LEDGER_TAMPERED/);

  const copied = makeBatch();
  const copyDir = mkdtempSync(join(tmpdir(), 'phase3b-batch-copy-'));
  const copyFile = join(copyDir, 'batch.json');
  writeFileSync(copyFile, readFileSync(copied.file, 'utf8'));
  // The ledger alone, without its separate authorization key, fails.
  assert.throws(() => openBatchLedger({file: copyFile, repoRoot}).snapshot(),
    /BATCH_AUTH_KEY_MISSING/);
});

test('batch mode rejects project mismatch without consuming attempts', async () => {
  const {file, ledger} = makeBatch();
  await assert.rejects(runTrial({
    mode: 'live', projectId: 'proj_other9999', credentialProvider: mockCredential,
    batchFile: file, fetchImpl: async () => { throw Error('must not run'); }}),
    /BATCH_PROJECT_MISMATCH/);
  assert.equal(ledger.snapshot().attempts_used, 0);
});
