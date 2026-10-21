// Phase 3B batch authorization ledger (offline engineering).
//
// A batch is created only by the Owner running the CLI creation
// command in a native terminal. The ledger file lives outside the
// repository and contains no API key, no authorization confirmation
// string and no secret of any kind: only batch scope, limits, expiry
// and accounting state.
//
// Every HTTP send must first reserve an attempt. Reservation is
// atomic across processes: an exclusive lock directory guards a
// read-modify-write cycle, and the ledger file itself is replaced by
// write-to-temp plus rename. Reserved attempts are never returned,
// so failures, timeouts, 429s and retries all consume the cap. An
// UNKNOWN_OUTCOME settles the batch into a stopped state that can
// only be cleared by the Owner creating a new batch after vendor
// usage reconciliation.

import {existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {OPENAI_MODEL} from './openai-live-gate.mjs';

export const BATCH_LIMITS = Object.freeze({
  maxAttempts: 6,
  budgetCapUsd: 0.10,
  model: OPENAI_MODEL.snapshot,
  cases: ['landyachtz-the-clark', 'woocommerce-bic00001', 'conflicting-facts-negative'],
  languages: ['zh-TW', 'en'],
});

function fail(message) { throw Error(message); }

function canonicalPath(path) {
  const absolute = resolve(path);
  try { return realpathSync(absolute); } catch {}
  // The file itself may not exist yet: canonicalize its parent (which
  // resolves symlinks and /tmp vs /private/tmp aliases) and re-append
  // the basename. A symlinked file that exists is resolved above.
  try { return resolve(realpathSync(dirname(absolute)), basename(absolute)); } catch {}
  return absolute;
}

export function assertBatchFileOutsideRepo(file, repoRoot) {
  const target = canonicalPath(file);
  const root = canonicalPath(repoRoot);
  if (target === root || target.startsWith(root + '/')) {
    fail('BATCH_FILE_INSIDE_REPO: batch ledger must live outside the repository');
  }
  return target;
}

function validateLedgerShape(data) {
  if (!data || typeof data !== 'object') fail('BATCH_LEDGER_INVALID: not an object');
  if (data.version !== 1) fail('BATCH_LEDGER_INVALID: unsupported version');
  if (typeof data.batch_id !== 'string' || !data.batch_id) fail('BATCH_LEDGER_INVALID: batch_id');
  if (data.model !== BATCH_LIMITS.model) fail('BATCH_LEDGER_INVALID: model scope');
  if (JSON.stringify(data.cases) !== JSON.stringify(BATCH_LIMITS.cases)) {
    fail('BATCH_LEDGER_INVALID: case scope');
  }
  if (JSON.stringify(data.languages) !== JSON.stringify(BATCH_LIMITS.languages)) {
    fail('BATCH_LEDGER_INVALID: language scope');
  }
  if (!(data.max_attempts >= 1 && data.max_attempts <= BATCH_LIMITS.maxAttempts)) {
    fail('BATCH_LEDGER_INVALID: max_attempts exceeds batch limit');
  }
  if (!(data.budget_cap_usd > 0 && data.budget_cap_usd <= BATCH_LIMITS.budgetCapUsd)) {
    fail('BATCH_LEDGER_INVALID: budget_cap_usd exceeds batch limit');
  }
  if (!Number.isFinite(Date.parse(data.expires_at))) fail('BATCH_LEDGER_INVALID: expires_at');
  if (!Number.isFinite(data.attempts_used) || data.attempts_used < 0) fail('BATCH_LEDGER_INVALID: attempts_used');
  if (!Number.isFinite(data.known_cost_usd) || data.known_cost_usd < 0) fail('BATCH_LEDGER_INVALID: known_cost_usd');
  if (data.pending_run_id === undefined) data.pending_run_id = null;
  if (data.pending_cost_usd == null) data.pending_cost_usd = 0;
  if (!Number.isFinite(data.pending_cost_usd) || data.pending_cost_usd < 0) fail('BATCH_LEDGER_INVALID: pending_cost_usd');
  return data;
}

function readLedger(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') fail('BATCH_NOT_FOUND: batch ledger does not exist');
    throw error;
  }
  let data;
  try { data = JSON.parse(raw); } catch { fail('BATCH_LEDGER_INVALID: corrupt JSON'); }
  return validateLedgerShape(data);
}

export const BATCH_ENABLE_CONFIRMATION = 'ENABLE-PHASE3B-BATCH';
export const BATCH_RECONCILE_CONFIRMATION = 'RECONCILED-PHASE3B-USAGE';

function authKeyPath(file) { return file + '.auth-key'; }

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function signLedger(data, authKey) {
  const {ledger_signature: _ignored, ...unsigned} = data;
  return createHmac('sha256', authKey).update(canonicalJson(unsigned)).digest('hex');
}

function loadAuthKey(file) {
  const path = authKeyPath(file);
  if (!existsSync(path)) return null;
  const key = readFileSync(path);
  if (key.length < 16) fail('BATCH_AUTH_KEY_INVALID: batch authorization key is too short');
  return key;
}

function verifyLedgerIntegrity(file, data) {
  const enabled = data.owner_enabled === true || data.status !== 'inactive';
  if (!enabled) {
    if (data.ledger_signature != null) fail('BATCH_LEDGER_TAMPERED: inactive batch carries a signature');
    return null;
  }
  const key = loadAuthKey(file);
  if (!key) fail('BATCH_AUTH_KEY_MISSING: enabled batch has no separate authorization key');
  if (typeof data.ledger_signature !== 'string') fail('BATCH_LEDGER_TAMPERED: missing signature');
  const expected = signLedger(data, key);
  const actualBuffer = Buffer.from(data.ledger_signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    fail('BATCH_LEDGER_TAMPERED: signature does not verify');
  }
  return key;
}

function readVerifiedLedger(file) {
  const data = readLedger(file);
  const key = verifyLedgerIntegrity(file, data);
  return {data, key};
}

function writeLedgerAtomic(file, data, authKey = null) {
  const dir = dirname(file);
  mkdirSync(dir, {recursive: true});
  if (authKey) data.ledger_signature = signLedger(data, authKey);
  const tmp = file + '.tmp-' + process.pid + '-' + randomUUID();
  writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n', {mode: 0o600});
  renameSync(tmp, file);
}

function acquireLock(file) {
  const lockDir = file + '.lock';
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      mkdirSync(lockDir);
      return () => { try { rmSync(lockDir, {recursive: true, force: true}); } catch {} };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - statSync(lockDir).mtimeMs;
        if (age > 60000) { rmSync(lockDir, {recursive: true, force: true}); continue; }
      } catch {}
      if (Date.now() > deadline) fail('BATCH_LOCK_TIMEOUT: could not acquire batch lock');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

function withLedgerLock(file, fn) {
  const release = acquireLock(file);
  try { return fn(); } finally { release(); }
}

export function createBatchLedger({file, repoRoot, projectId, expiresInHours = 24,
  maxAttempts = BATCH_LIMITS.maxAttempts, budgetCapUsd = BATCH_LIMITS.budgetCapUsd} = {}) {
  const target = assertBatchFileOutsideRepo(file, repoRoot);
  if (typeof projectId !== 'string' || !/^proj_[A-Za-z0-9][A-Za-z0-9_-]{7,}$/.test(projectId)) {
    fail('PROJECT_ID_REQUIRED: valid non-secret OpenAI project id (proj_...) required');
  }
  if (!(expiresInHours >= 1 && expiresInHours <= 168)) fail('BATCH_EXPIRY_INVALID: 1 to 168 hours');
  if (!(maxAttempts >= 1 && maxAttempts <= BATCH_LIMITS.maxAttempts)) {
    fail('BATCH_ATTEMPT_LIMIT_EXCEEDS_MAX: at most ' + BATCH_LIMITS.maxAttempts);
  }
  if (!(budgetCapUsd > 0 && budgetCapUsd <= BATCH_LIMITS.budgetCapUsd)) {
    fail('BATCH_BUDGET_LIMIT_EXCEEDS_MAX: at most US$' + BATCH_LIMITS.budgetCapUsd);
  }
  if (existsSync(target)) fail('BATCH_ALREADY_EXISTS: refusing to overwrite an existing batch ledger');
  const now = new Date();
  const data = {
    version: 1,
    batch_id: 'phase3b-' + now.toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 8),
    project_id: projectId,
    model: BATCH_LIMITS.model,
    cases: [...BATCH_LIMITS.cases],
    languages: [...BATCH_LIMITS.languages],
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + expiresInHours * 3600_000).toISOString(),
    max_attempts: maxAttempts,
    budget_cap_usd: budgetCapUsd,
    attempts_used: 0,
    attempts_pending: 0,
    known_cost_usd: 0,
    pending_cost_usd: 0,
    pending_run_id: null,
    unknown_cost_attempts: 0,
    status: 'inactive',
    stop_reason: null,
    owner_enabled: false,
    enabled_by: null,
    ledger_signature: null,
  };
  writeLedgerAtomic(target, data);
  return data;
}

export function enableBatchLedger({file, repoRoot, confirmation} = {}) {
  const target = assertBatchFileOutsideRepo(file, repoRoot);
  if (confirmation !== BATCH_ENABLE_CONFIRMATION) {
    fail('BATCH_ENABLE_NOT_AUTHORIZED: Owner explicit batch enable confirmation required');
  }
  return withLedgerLock(target, () => {
    const {data} = readVerifiedLedger(target);
    if (data.owner_enabled === true || data.status === 'active') fail('BATCH_ALREADY_ENABLED');
    if (data.status !== 'inactive') fail('BATCH_NOT_ACTIVE: status is ' + data.status);
    if (Date.now() > Date.parse(data.expires_at)) fail('BATCH_EXPIRED: batch authorization has expired');
    const keyPath = authKeyPath(target);
    if (existsSync(keyPath)) fail('BATCH_AUTH_KEY_EXISTS: refusing to replace an existing authorization key');
    const authKey = randomBytes(32);
    writeFileSync(keyPath, authKey, {mode: 0o600, flag: 'wx'});
    data.owner_enabled = true;
    data.status = 'active';
    data.enabled_by = 'owner_local_enable_command';
    data.enabled_at = new Date().toISOString();
    writeLedgerAtomic(target, data, authKey);
    return data;
  });
}

export function reconcileBatchLedger({file, repoRoot, confirmation} = {}) {
  const target = assertBatchFileOutsideRepo(file, repoRoot);
  if (confirmation !== BATCH_RECONCILE_CONFIRMATION) {
    fail('BATCH_RECONCILE_NOT_AUTHORIZED: Owner usage reconciliation confirmation required');
  }
  return withLedgerLock(target, () => {
    const {data, key} = readVerifiedLedger(target);
    // Reconciliation never reactivates a batch and never clears an
    // UNKNOWN_OUTCOME: unsettled attempts become unknown-cost and
    // the batch remains stopped for a fresh Owner decision.
    if (data.attempts_pending > 0) data.unknown_cost_attempts += data.attempts_pending;
    data.attempts_pending = 0;
    data.pending_cost_usd = 0;
    data.status = 'stopped_unknown_pending';
    data.stop_reason = 'Reconciled by Owner: unsettled attempts treated as unknown cost; batch remains stopped';
    writeLedgerAtomic(target, data, key);
    return data;
  });
}

export function openBatchLedger({file, repoRoot} = {}) {
  const target = assertBatchFileOutsideRepo(file, repoRoot);
  const instanceRunId = randomUUID();
  const snapshot = () => readVerifiedLedger(target).data;
  const assertUsableForReserve = (data, runId) => {
    if (data.owner_enabled !== true) fail('BATCH_NOT_ENABLED: owner has not enabled this batch');
    if (data.status !== 'active' && data.status !== 'exhausted') fail('BATCH_NOT_ACTIVE: status is ' + data.status);
    if (Date.now() > Date.parse(data.expires_at)) fail('BATCH_EXPIRED: batch authorization has expired');
    if ((data.attempts_pending > 0 || data.pending_cost_usd > 0) && data.pending_run_id !== runId) {
      fail('BATCH_SETTLEMENT_PENDING: unsettled reserved attempts must be reconciled by the Owner; automatic retry is forbidden');
    }
    return data;
  };
  const assertUsable = (data) => {
    if (data.owner_enabled !== true) fail('BATCH_NOT_ENABLED: owner has not enabled this batch');
    if (data.status !== 'active') fail('BATCH_NOT_ACTIVE: status is ' + data.status);
    if (Date.now() > Date.parse(data.expires_at)) fail('BATCH_EXPIRED: batch authorization has expired');
    if (data.attempts_pending > 0 || data.pending_cost_usd > 0) {
      fail('BATCH_SETTLEMENT_PENDING: unsettled reserved attempts must be reconciled by the Owner; automatic retry is forbidden');
    }
    if (data.project_id == null) fail('BATCH_LEDGER_INVALID: project_id');
    return data;
  };
  return {
    file: target,
    snapshot,
    validateFor({projectId, caseId, language} = {}) {
      const data = assertUsable(snapshot());
      if (projectId !== data.project_id) fail('BATCH_PROJECT_MISMATCH: project id does not match batch');
      if (caseId != null && !data.cases.includes(caseId)) fail('BATCH_CASE_NOT_ALLOWED: ' + caseId);
      if (language != null && !data.languages.includes(language)) fail('BATCH_LANGUAGE_NOT_ALLOWED: ' + language);
      if (data.attempts_used >= data.max_attempts) fail('BATCH_EXHAUSTED: attempt cap reached');
      if (data.known_cost_usd + data.pending_cost_usd >= data.budget_cap_usd) fail('BATCH_EXHAUSTED: budget cap reached');
      return data;
    },
    reserveAttempt({estimatedCostUsd = 0, runId = instanceRunId} = {}) {
      return withLedgerLock(target, () => {
        const {data, key} = readVerifiedLedger(target);
        assertUsableForReserve(data, runId);
        if (data.attempts_used >= data.max_attempts) fail('BATCH_EXHAUSTED: attempt cap reached');
        const estimate = Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0 ? estimatedCostUsd : 0;
        if (data.known_cost_usd + data.pending_cost_usd + estimate > data.budget_cap_usd) {
          fail('BATCH_EXHAUSTED: budget cap reached');
        }
        data.attempts_used += 1;
        data.attempts_pending += 1;
        data.pending_run_id = runId;
        data.pending_cost_usd = Math.round((data.pending_cost_usd + estimate) * 1e10) / 1e10;
        if (data.attempts_used >= data.max_attempts) data.status = 'exhausted';
        writeLedgerAtomic(target, data, key);
        return data.attempts_used;
      });
    },
    settleRun({attemptCount = 0, knownCostDelta = 0, reservedCostUsd = 0, unknownOutcome = false, stopReason = null} = {}) {
      return withLedgerLock(target, () => {
        const {data, key} = readVerifiedLedger(target);
        if (data.attempts_pending > 0 && data.pending_run_id !== instanceRunId) {
          fail('BATCH_SETTLEMENT_PENDING: only the reserving process may settle; recovery requires Owner reconciliation');
        }
        data.attempts_pending = Math.max(0, data.attempts_pending - attemptCount);
        if (Number.isFinite(reservedCostUsd) && reservedCostUsd > 0) {
          data.pending_cost_usd = Math.max(0,
            Math.round((data.pending_cost_usd - reservedCostUsd) * 1e10) / 1e10);
        }
        if (Number.isFinite(knownCostDelta) && knownCostDelta > 0) {
          data.known_cost_usd = Math.round((data.known_cost_usd + knownCostDelta) * 1e10) / 1e10;
        }
        if (unknownOutcome) {
          data.unknown_cost_attempts += 1;
          data.status = 'stopped_unknown_pending';
          data.stop_reason = 'UNKNOWN_OUTCOME: reconcile vendor usage before any new batch';
        } else if (stopReason) {
          data.status = 'stopped';
          data.stop_reason = String(stopReason).slice(0, 128);
        } else if (data.status === 'active'
          && (data.attempts_used >= data.max_attempts || data.known_cost_usd >= data.budget_cap_usd)) {
          data.status = 'exhausted';
        }
        if (data.attempts_pending === 0) data.pending_run_id = null;
        writeLedgerAtomic(target, data, key);
        return data;
      });
    },
    stop(reason = 'owner stop') {
      return withLedgerLock(target, () => {
        const {data, key} = readVerifiedLedger(target);
        data.status = 'stopped';
        data.stop_reason = String(reason).slice(0, 128);
        writeLedgerAtomic(target, data, key);
        return data;
      });
    },
  };
}
