import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
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

// IPC barriers control only test scheduling; production locks/gates are unchanged.
function batchWorker(t,file){
 const child=spawn(process.execPath,[fileURLToPath(new URL('./batch-concurrency.test-worker.mjs',import.meta.url)),file,repoRoot],
  {stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
 const pending=new Map(),events=[];let next=0,stdout='',stderr='',spawnError=null,readyResolve,readyReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
 child.on('message',m=>{if(m.ready){readyResolve();return;}events.push(m);const waiter=pending.get(m.id);if(waiter){pending.delete(m.id);waiter.resolve(m);}});
 child.on('error',error=>{spawnError={name:error.name,message:error.message,stack:error.stack};readyReject(error);});
 const closed=new Promise(resolve=>child.on('close',(exit_code,signal)=>{
  const record={exit_code,signal,stdout,stderr,spawn_error:spawnError,events};
  const error=Error('Batch worker closed before response: '+JSON.stringify(record));readyReject(error);
  for(const waiter of pending.values())waiter.reject(error);pending.clear();resolve(record);
 }));
 t.after(async()=>{if(child.connected)child.send({operation:'close'});if(child.exitCode===null&&child.signalCode===null)await closed;});
 return {ready,events,command(operation){return new Promise((resolve,reject)=>{
  const id=++next;pending.set(id,{resolve,reject});child.send({id,operation},error=>{if(error){pending.delete(id);reject(error);}});
 });},async finish(){child.send({operation:'close'});const record=await closed;
  assert.equal(record.exit_code,0,JSON.stringify(record));assert.equal(record.signal,null,JSON.stringify(record));
  assert.equal(record.stderr,'',JSON.stringify(record));assert.equal(record.stdout,'',JSON.stringify(record));
  assert.equal(record.spawn_error,null,JSON.stringify(record));return record;
 }};
}
const success=response=>{assert.equal(response.ok,true,JSON.stringify(response));return response;};
const refusal=(response,code)=>{assert.equal(response.ok,false,JSON.stringify(response));
 assert.equal(response.error.name,'Error');assert.ok(response.error.message.startsWith(code+':'),JSON.stringify(response));
 assert.ok(response.error.stack.includes(response.error.message));return response;
};
const workersFor=(t,file)=>{const workers=Array.from({length:3},()=>batchWorker(t,file));
 // Close workers before removing only this test's disposable ledger/key directory.
 t.after(()=>rmSync(dirname(file),{recursive:true,force:true}));return workers;
};

test('concurrent processes cannot reserve beyond the batch cap', {timeout:15000},async t=>{
 const {file,ledger}=makeBatch({maxAttempts:6});
 // Seed five real, fully settled reservations. Exactly one slot remains, so the
 // race tests the cap boundary without assuming fair scheduling or auto-retry.
 for(let i=0;i<5;i++){ledger.reserveAttempt({estimatedCostUsd:0.0001});ledger.settleRun({attemptCount:1,knownCostDelta:0.0001,reservedCostUsd:0.0001});}
 const workers=workersFor(t,file);await Promise.all(workers.map(w=>w.ready));
 const responses=await Promise.all(workers.map(w=>w.command('reserve')));
 const winners=responses.flatMap((r,i)=>r.ok?[i]:[]);assert.equal(winners.length,1,JSON.stringify(responses));
 responses.filter(r=>!r.ok).forEach(r=>refusal(r,'BATCH_SETTLEMENT_PENDING'));
 const held=ledger.snapshot();assert.equal(held.attempts_used,6);assert.equal(held.attempts_pending,1);
 assert.equal(held.pending_cost_usd,0.0001);assert.equal(held.known_cost_usd,0.0005);
 // Retain the exact six-success and six-used assertions: five settled seeds
 // plus one process wins. Refusals do not become successful reservations.
 const counts=[5,...responses.map(r=>Number(r.ok))];
 assert.equal(counts.reduce((a,b)=>a+b,0),6);
 assert.equal(openBatchLedger({file,repoRoot}).snapshot().attempts_used,6);
 success(await workers[winners[0]].command('settle'));
 const settled=ledger.snapshot();assert.equal(settled.status,'exhausted');
 assert.equal(settled.attempts_pending,0);assert.equal(settled.pending_cost_usd,0);
 assert.equal(settled.known_cost_usd,0.0006);assert.equal(settled.unknown_cost_attempts,0);
 const exhausted=await Promise.all(workers.map(w=>w.command('reserve')));
 for(const r of exhausted){refusal(r,'BATCH_EXHAUSTED');assert.deepEqual(r.after,r.before);}
 assert.deepEqual(ledger.snapshot(),settled);
 const children=await Promise.all(workers.map(w=>w.finish()));
 t.diagnostic('BATCH_CONCURRENCY_CAP '+JSON.stringify({counts,children,final:exhausted[0].after}));
});

test('original five-iteration schedule can yield five successes while all safety gates hold', {timeout:15000},async t=>{
 const {file,ledger}=makeBatch({maxAttempts:6}),workers=workersFor(t,file);
 await Promise.all(workers.map(w=>w.ready));const held=success(await workers[0].command('reserve')).after;
 // Hold the original first reservation until both other processes have used
 // all five of their original iterations. No sleeps, polling, or retry loop.
 const rejected=await Promise.all(workers.slice(1).map(async w=>{
  const responses=[];for(let i=0;i<5;i++){const r=refusal(await w.command('reserve'),'BATCH_SETTLEMENT_PENDING');
   assert.deepEqual(r.before,held);assert.deepEqual(r.after,held);responses.push(r);}
  return responses;
 }));
 assert.equal(ledger.snapshot().attempts_used,1);assert.equal(ledger.snapshot().attempts_pending,1);
 success(await workers[0].command('settle'));
 for(let i=1;i<5;i++){success(await workers[0].command('reserve'));success(await workers[0].command('settle'));}
 const final=ledger.snapshot();assert.equal(final.attempts_used,5);assert.equal(final.attempts_pending,0);
 assert.equal(final.known_cost_usd,0.0005);assert.equal(final.pending_cost_usd,0);assert.equal(final.status,'active');
 const children=await Promise.all(workers.map(w=>w.finish()));
 t.diagnostic('BATCH_CONCURRENCY_ORIGINAL_SCHEDULE '+JSON.stringify({original_expected:6,actual:final.attempts_used,
  rejected_count:rejected.flat().length,children,final:children[0].events.at(-1).after}));
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
