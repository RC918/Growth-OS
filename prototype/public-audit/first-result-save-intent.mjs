// Unwired, synthetic-context contract only: no dispatch, Auth, storage or authority.
import {contentDigest, reviewFields} from '../../apps/web/first-result-review.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireThat = (condition, code) => { if (!condition) throw Error(code); };
const exactKeys = (value, keys) => record(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const whole = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string';
const nonempty = value => text(value) && value.trim().length > 0;
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// JSON-only and bounded before cloning/hashing; reject lossy values, cycles and lone surrogates.
function copyJSON(input) {
  let nodes = 0, characters = 0;
  const seen = new Set();
  function visit(value, depth) {
    requireThat(depth <= 24 && ++nodes <= 100000, 'PAYLOAD_LIMIT');
    if (text(value)) {
      characters += value.length;
      requireThat(characters <= 8 * 1024 * 1024, 'PAYLOAD_LIMIT');
      requireThat(value.isWellFormed(), 'INVALID_UNICODE');
    } else if (typeof value === 'number') requireThat(Number.isFinite(value), 'INVALID_JSON');
    else if (value !== null && typeof value === 'object') {
      requireThat(!seen.has(value) && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'INVALID_JSON');
      seen.add(value);
      for (const [key, child] of Object.entries(value)) { visit(key, depth + 1); visit(child, depth + 1); }
      if (Array.isArray(value)) requireThat(Object.keys(value).length === value.length, 'INVALID_JSON');
      seen.delete(value);
    } else requireThat(value === null || typeof value === 'boolean', 'INVALID_JSON');
  }
  visit(input, 0);
  const encoded = JSON.stringify(input);
  requireThat(new TextEncoder().encode(encoded).length <= 8 * 1024 * 1024, 'PAYLOAD_LIMIT');
  return JSON.parse(encoded);
}
function validURL(value) {
  if (!text(value) || value.length > 2048 || /[\s\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
const bindingOf = s => ({original_url: s.original_url, final_url: s.final_url, snapshot_id: s.id, source_version: s.version});
const matches = (value, binding) => record(value) && Object.entries(binding).every(([key, expected]) => value[key] === expected);

async function validateReport(r) {
  requireThat(!['organization_id','opportunity_id','request_id','expected_version','fixture_context'].some(key => key in r), 'AMBIGUOUS_WORKSPACE_SCOPE');
  const s = r.snapshot, p = r.preview, v = r.review;
  requireThat(record(s) && s.schema_version === 1 && uuid(s.id) && /^[0-9a-f]{64}$/.test(s.version), 'INVALID_SNAPSHOT');
  requireThat(validURL(s.original_url) && validURL(s.final_url), 'INVALID_URL');
  requireThat(text(s.fetched_at) && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(s.fetched_at) && Number.isFinite(Date.parse(s.fetched_at)), 'INVALID_FETCH_TIME');
  requireThat(text(s.content_base64) && s.content_base64.length <= 1398104 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s.content_base64), 'INVALID_SOURCE_BYTES');
  const binary = atob(s.content_base64);
  requireThat(binary.length > 0 && binary.length <= 1048576 && btoa(binary) === s.content_base64, 'INVALID_SOURCE_BYTES');
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const sourceHash = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  requireThat(sourceHash === s.content_fingerprint && sourceHash === 'sha256:' + s.version, 'SOURCE_HASH_MISMATCH');
  requireThat(s.encoding === 'utf-8-with-replacement' && s.html === new TextDecoder('utf-8', {ignoreBOM: true}).decode(bytes), 'SOURCE_TEXT_MISMATCH');
  const binding = bindingOf(s);
  requireThat(record(p) && p.source_snapshot_id === s.id && p.source_version === s.version && p.published === false, 'PREVIEW_BINDING_MISMATCH');
  requireThat(record(v) && v.schema_version === 1 && v.scope === 'page_only' && v.persisted === false && matches(v, binding) && whole(v.revision), 'REVIEW_BINDING_MISMATCH');
  requireThat(exactKeys(p.fields, reviewFields) && exactKeys(v.original_suggestions, reviewFields) && exactKeys(v.edited, reviewFields) && exactKeys(v.fact_checks, reviewFields), 'INVALID_FIELDS');
  const ids = new Set();
  requireThat(Array.isArray(s.citations) && s.citations.length > 0, 'INVALID_CITATIONS');
  for (const c of s.citations) {
    requireThat(record(c) && nonempty(c.id) && !ids.has(c.id) && c.snapshot_id === s.id && c.source_version === s.version && c.url === s.final_url && nonempty(c.locator) && nonempty(c.quote), 'INVALID_CITATIONS');
    ids.add(c.id);
  }
  function references(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.every(id => text(id) && ids.has(id)), 'CITATION_REFERENCE_MISMATCH');
  }
  requireThat(record(r.facts) && record(r.facts.product_name) && record(r.facts.description), 'INVALID_FACTS');
  function evidence(value) {
    if (Array.isArray(value)) { value.forEach(evidence); return; }
    if (!record(value)) return;
    if ('citations' in value) references(value.citations);
    if (value.kind === 'fact') requireThat(value.verification === 'source_asserted' && nonempty(value.value) && 'citations' in value, 'INVALID_FACTS');
    for (const [key, child] of Object.entries(value)) if (key !== 'citations') evidence(child);
  }
  requireThat(r.facts.product_name.kind === 'fact' && r.facts.description.kind === 'fact', 'INVALID_FACTS');
  evidence(r.facts); evidence(r.inferences);
  const fields = {};
  for (const key of reviewFields) {
    const f = p.fields[key];
    requireThat(record(f) && nonempty(f.suggested) && f.suggested.length <= 2000 && text(f.original) && nonempty(v.original_suggestions[key]) && v.original_suggestions[key].length <= 2000, 'INVALID_FIELD_SIZE');
    references(f.citations);
    requireThat(f.original === (r.facts[key]?.value ?? ''), 'ORIGINAL_FACT_MISMATCH');
    const edited = f.suggested !== v.original_suggestions[key];
    requireThat(v.edited[key] === edited && f.user_edited === edited && f.citation_role === (edited ? 'reference_only_for_user_edit' : 'source_support') && typeof v.fact_checks[key] === 'boolean', 'EDIT_ATTRIBUTION_MISMATCH');
    fields[key] = f.suggested;
  }
  const digest = await contentDigest(JSON.stringify({schema_version: 1, ...binding, revision: v.revision, fields}));
  requireThat(v.content_digest === digest, 'CONTENT_DIGEST_MISMATCH');
  if (v.confirmation !== null) {
    const c = v.confirmation;
    requireThat(exactKeys(c, ['scope','original_url','final_url','snapshot_id','source_version','revision','content_digest','fact_checks']) && c.scope === 'page_only' && matches(c, binding) && c.revision === v.revision && c.content_digest === digest && exactKeys(c.fact_checks, reviewFields) && reviewFields.every(key => c.fact_checks[key] === true && v.fact_checks[key] === true), 'STALE_PAGE_CONFIRMATION');
  }
  requireThat(p.status === (v.confirmation === null ? 'awaiting_review' : 'locally_confirmed'), 'REVIEW_STATUS_MISMATCH');
  return {binding, digest, sourceHash};
}

/** Returns a frozen candidate or a reason-only unmapped/ineligible/invalid result. */
export async function createFirstResultSaveIntent(exported, fixtureContext) {
  if (fixtureContext == null) return freeze({status: 'unmapped', reason: 'WORKSPACE_MAPPING_REQUIRED', intent: null});
  let context, report;
  try { context = copyJSON(fixtureContext); } catch (e) { return freeze({status: 'ineligible', reason: e.message, intent: null}); }
  const contextKeys = ['schema_version','fixture_only','organization_id','opportunity_id','request_id','expected_version','role','opportunity_status','has_source','has_approved_decision','mapped_source','expected_review_revision','expected_content_digest'];
  if (!exactKeys(context, contextKeys) || context.schema_version !== 1 || context.fixture_only !== true || !uuid(context.organization_id) || !uuid(context.opportunity_id) || !uuid(context.request_id) || !whole(context.expected_version) || context.expected_version >= Number.MAX_SAFE_INTEGER || context.role !== 'owner' || context.opportunity_status !== 'approved' || context.has_source !== true || context.has_approved_decision !== true || !whole(context.expected_review_revision) || !exactKeys(context.mapped_source, ['original_url','final_url','snapshot_id','source_version'])) {
    return freeze({status: 'ineligible', reason: 'ELIGIBLE_FIXTURE_CONTEXT_REQUIRED', intent: null});
  }
  try {
    // Snapshot both inputs before awaiting any digest; caller mutations cannot mix versions.
    report = copyJSON(exported);
    requireThat(record(report), 'INVALID_EXPORT');
    const {binding, digest, sourceHash} = await validateReport(report);
    requireThat(matches(context.mapped_source, binding) && context.expected_review_revision === report.review.revision && context.expected_content_digest === digest, 'CONTEXT_BINDING_MISMATCH');
    const request = {schema_version: 1, kind: 'first_result_draft_save_intent', fixture_context: context, report};
    const requestDigest = await contentDigest(canonical(request));
    return freeze({status: 'candidate', intent: {
      ...request, request_digest: requestDigest, source_digest: sourceHash, content_digest: digest,
      authority: {server_authorized: false, owner_approved: false, independently_verified: false, persisted: false, published: false},
      provenance: 'caller_supplied_unverified',
      legacy_compatibility: {compatible: false, reasons: ['LEGACY_TITLE_MAX_160_VS_REVIEW_2000', 'LEGACY_TITLE_BODY_CANNOT_PRESERVE_TYPED_SOURCE_AND_REVIEW']},
    }});
  } catch (e) { return freeze({status: 'invalid', reason: e.message, intent: null}); }
}
