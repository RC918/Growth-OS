import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {BATCH_LIMITS, createBatchLedger, openBatchLedger} from './batch-authorization.mjs';
import {runTrial} from './run-phase3b-trial.mjs';

const repoRoot = '/tmp/growth-takeover/wt';
const makeBatch = (overrides = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'phase3b-batch-'));
  const file = join(dir, 'batch.json');
  const created = createBatchLedger({file, repoRoot, projectId: 'proj_test12345', ...overrides});
  return {file, created, ledger: openBatchLedger({file, repoRoot})};
};
const mockCredential = async () => 'mock-credential-not-real';
let nonce = 0;
const confirmation = () => 'PHASE3B-LIVE-ONCE:batch-test-' + (++nonce) + '-abcdefghij';

test('batch ledger persists scope, limits and never stores secrets', () => {
  const {file, created} = makeBatch();
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
  const raw = JSON.parse(readFileSync(expired.file, 'utf8'));
  raw.expires_at = new Date(Date.now() - 1000).toISOString();
  writeFileSync(expired.file + '.tmp', JSON.stringify(raw));
  renameSync(expired.file + '.tmp', expired.file);
  assert.throws(() => expired.ledger.reserveAttempt(), /BATCH_EXPIRED/);

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
    import {openBatchLedger} from ${JSON.stringify(new URL('./batch-authorization.mjs', 'file:///tmp/growth-takeover/wt/prototype/ai-seo/').href)};
    const ledger = openBatchLedger({file: ${JSON.stringify(file)}, repoRoot: ${JSON.stringify(repoRoot)}});
    let ok = 0;
    for (let i = 0; i < 5; i++) { try { ledger.reserveAttempt(); ok++; } catch {} }
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

test('batch mode rejects project mismatch without consuming attempts', async () => {
  const {file, ledger} = makeBatch();
  await assert.rejects(runTrial({
    mode: 'live', projectId: 'proj_other9999', credentialProvider: mockCredential,
    batchFile: file, fetchImpl: async () => { throw Error('must not run'); }}),
    /BATCH_PROJECT_MISMATCH/);
  assert.equal(ledger.snapshot().attempts_used, 0);
});
