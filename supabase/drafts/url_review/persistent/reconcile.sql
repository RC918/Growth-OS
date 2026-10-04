-- READ ONLY. Fill ALL fields from the ORIGINAL pending metadata / known response, never allocate a new request.
-- NULL placeholders deliberately match nothing; an empty result is UNKNOWN, not permission to POST.
with original(organization_id,version_id,request_id,actor_id,known_review_id,source_digest,content_digest,version_digest) as (
 values(null::uuid,null::uuid,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text)
)
select r.*,v.version_number,v.first_result_request_digest,v.first_result_payload,
 r.actor_user_id=o.actor_id and r.url_review_source_digest=o.source_digest and r.url_review_content_digest=o.content_digest and r.url_review_version_digest=o.version_digest and (o.known_review_id is null or r.id=o.known_review_id) as original_intent_matches,
 (select jsonb_agg(to_jsonb(a)) from public.audit_events a where a.organization_id=r.organization_id and a.event_type='url_result_reviewed' and a.object_id=r.version_id and a.details->>'request_id'=r.url_review_request_id::text) as matching_audit
from original o join public.content_reviews r on r.organization_id=o.organization_id and r.version_id=o.version_id and r.url_review_request_id=o.request_id
join public.content_versions v on v.organization_id=r.organization_id and v.id=r.version_id;
-- DDL/DCL unknown: state.sql + full migration history + artifact statement hashes.
-- Existing/partial installation, history/body/ACL disagreement, timeout or missing response: STOP writes.
-- No automatic reinstall/enable/restore, no history deletion, no marker clearing or request rotation.
