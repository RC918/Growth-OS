-- GET-equivalent read only: compare known review UUID when one was returned. Empty never permits POST.
select * from public.content_reviews where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and version_id='5802e838-8a06-46c6-934a-0a8c38ba1daa' and url_review_request_id='1f3f43cb-a64c-4739-a4a7-772d5b2cb781';
select * from public.audit_events where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and event_type='url_result_reviewed' and object_id='5802e838-8a06-46c6-934a-0a8c38ba1daa' and details->>'request_id'='1f3f43cb-a64c-4739-a4a7-772d5b2cb781';
select * from public.content_versions where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and opportunity_id='9bafbb2f-eea7-48ea-bc23-3896897f19c3' order by version_number;
