-- Phase 1 isolated-staging: replace the expired bounded-trial save
-- implementation with the general owner-role implementation from
-- supabase/drafts/url_result/proposal.sql (verbatim function body below).
-- Target project ONLY: vhzryhibmpvglzcmfnaa (isolated staging).
-- Why: the currently deployed impl is the 2026-10-04 revision-bound trial
-- variant pinned to one fixed actor/request with a cutoff that has passed,
-- so every real save is rejected with 'Bound owner required' even though
-- EXECUTE is now granted. The general impl still enforces, inside the
-- transaction: auth.uid() present, owner membership re-check, payload
-- validation, expected-version, request idempotency and atomic audit.
-- It grants no table writes and does not change RLS or table grants.
--
-- Execute once (postgres role), then re-run the verification select.
-- Rollback: revoke execute on both save functions from authenticated
-- (see supabase/tests/phase1_save_open_staging.sql), which closes saving
-- again without touching saved drafts.

create or replace function private.save_url_result_draft_impl(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old public.content_versions%rowtype; parent public.growth_opportunities%rowtype;
 latest integer; result_id uuid; fingerprint text; created_parent boolean:=false;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_opportunity_id is not null and p_request_id is not null and p_expected_version between 0 and 2147483646 and p_payload is not null,'INVALID_REQUEST');
 perform 1 from public.organizations where id=p_organization_id for no key update;
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);
 select * into old from public.content_versions where organization_id=p_organization_id and first_result_request_id=p_request_id;
 if found then
  if old.created_by<>actor or old.opportunity_id<>p_opportunity_id or old.first_result_expected_version<>p_expected_version
   or old.first_result_payload is distinct from p_payload or old.first_result_request_digest<>fingerprint
   or not exists(select 1 from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id and entry_kind='url_result') then
   raise exception 'Request ID payload differs' using errcode='22023'; end if;
  return old.id;
 end if;
 perform private.fr_require(private.fr_valid_payload(p_payload),'INVALID_PAYLOAD');
 select * into parent from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id for update;
 if not found then
  if p_expected_version<>0 then raise exception 'URL parent missing' using errcode='PT409'; end if;
  -- Primary key also rejects a foreign-org UUID collision without reparenting.
  insert into public.growth_opportunities(id,organization_id,entry_kind,status,source_identity)
   values(p_opportunity_id,p_organization_id,'url_result','url_pending_review',private.url_source_identity(p_payload));
  created_parent:=true;
 else
  if parent.entry_kind<>'url_result' or parent.status<>'url_pending_review' or parent.source_identity is distinct from private.url_source_identity(p_payload) then
   raise exception 'URL parent/source mismatch' using errcode='23514'; end if;
  if p_expected_version=0 then raise exception 'URL parent already exists' using errcode='PT409'; end if;
 end if;
 select coalesce(max(version_number),0) into latest from public.content_versions where organization_id=p_organization_id and opportunity_id=p_opportunity_id;
 if latest<>p_expected_version then raise exception 'Content version changed; read back first' using errcode='PT409'; end if;
 insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,
 first_result_payload,first_result_request_id,first_result_expected_version,first_result_request_digest)
 values(p_organization_id,p_opportunity_id,latest+1,p_payload#>>'{preview,fields,title,suggested}',p_payload#>>'{preview,fields,description,suggested}',actor,
 p_payload,p_request_id,p_expected_version,fingerprint) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'url_result_draft_saved','content_version',result_id,jsonb_build_object('request_id',p_request_id,'version_number',latest+1,
 'opportunity_id',p_opportunity_id,'created_parent',created_parent,'source_digest',p_payload#>>'{snapshot,content_fingerprint}',
 'content_digest',private.fr_content_digest(p_payload),'request_digest',fingerprint,'provenance','caller_supplied_unverified','approval','none'));
 return result_id;
end $$;

-- Verification: a synthetic org owner must now be able to call the RPC;
-- has_function_privilege must remain true for authenticated.
select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
  and p.proname in ('save_url_result_draft','save_url_result_draft_impl')
order by n.nspname, p.proname;
