// Offline pilot/GSC readiness preflight (JS parity of pilot_preflight.py).
// No account, network, database, or site write is used. The persistent
// Workspace store (snapshot v2 via the existing save/load contract) is the
// authority; local stores and retained caches are never authoritative.
// Provider declarations stay unverified: google_verified, traffic_verified
// and causal_claim are always false, and a real pilot is never ready here.
import {preview} from '../../apps/web/search-baseline.mjs';
import {loadSnapshot, saveSnapshot} from '../../apps/web/baseline-snapshot.mjs';

export const SNAPSHOT_AUTHORITY = 'workspace_persistent';
export const LOCAL_STORE_ROLE = 'cache_only_not_authoritative';
export const PENDING_EXTERNAL_AUTHORIZATION = ['real_gsc_account_authorization', 'real_site_write_permission'];

export function assessPilotReadiness(text, meta, {sample} = {}) {
  if (typeof sample !== 'boolean') throw Error('Declare sample true or false explicitly.');
  const checked = preview(text, meta);
  const blockers = [];
  if (!checked.complete) blockers.push({code: 'missing_dates', dates: checked.missing, detail: '缺日為未知，不填零；補齊前不得作為試點基線。'});
  const workspaceSaveReady = blockers.length === 0;
  let snapshot = null;
  if (workspaceSaveReady) {
    // Serialize through the same save/load validation the Workspace uses,
    // so a snapshot that cannot be reloaded is never reported as ready.
    snapshot = JSON.parse(saveSnapshot(checked, null, {a: sample, b: false}));
    loadSnapshot(JSON.stringify(snapshot));
  }
  return {
    state: workspaceSaveReady ? 'ready' : 'not_ready',
    workspace_save_ready: workspaceSaveReady,
    real_pilot_ready: false,
    data_kind: sample ? 'synthetic_declared' : 'provider_asserted_unverified',
    authority: {snapshot: SNAPSHOT_AUTHORITY, local_store: LOCAL_STORE_ROLE, local_caches_are_authoritative: false},
    workspace_snapshot: snapshot,
    blockers,
    pending_external_authorization: [...PENDING_EXTERNAL_AUTHORIZATION],
    google_verified: false,
    traffic_verified: false,
    causal_claim: false,
    indexing_status: 'unknown',
    unknowns: [
      '網站來源、搜尋類型與匯出時間由提供者聲明，尚未向 Google 核實。',
      '未提供到站訪問、商業轉換或 AI 能見度資料，因此這些成果仍未知。',
      ...(checked.complete ? [] : [`缺少日期：${checked.missing.join('、')}。缺日為未知，加總不能代表完整期間。`]),
    ],
  };
}
