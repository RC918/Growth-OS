// Historical fixture-only context contract; real UI uses the shared payload validator.
import {contentDigest} from '../../apps/web/first-result-review.mjs';
import {validateReport,copyJSON,freeze,canonical,matches} from '../../apps/web/first-result-payload.mjs';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireThat = (condition, code) => { if (!condition) throw Error(code); };
const exactKeys = (value, keys) => record(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const whole = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string';
const nonempty = value => text(value) && value.trim().length > 0;
const stringList = value => Array.isArray(value) && value.length > 0 && value.every(nonempty);
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
