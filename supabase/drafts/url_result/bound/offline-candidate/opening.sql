-- OFFLINE CANDIDATE. Not approved. Absolute cutoff: 2099-01-01T00:00:00.000Z
-- Authenticated callers remain bound inside the existing private implementation.
DO $bound_open$
BEGIN
 if (select count(*) from supabase_migrations.schema_migrations)<>19 or not exists(select 1 from supabase_migrations.schema_migrations where version='20261003040602') then raise exception 'Expected 19-record closed-schema baseline'; end if;
 if exists(select 1 from public.growth_opportunities where id='9bafbb2f-eea7-48ea-bc23-3896897f19c3') or exists(select 1 from public.content_versions where first_result_request_id='4d602b3f-272f-4282-9906-b0cc0155e1c7') then raise exception 'Fixed parent/request already exists'; end if;
 EXECUTE $url_ddl$
-- OFFLINE candidate only. Depends on the deployed closed first-result package.
-- No client EXECUTE grants. Never modify or replay the historical closed package.
alter table public.growth_opportunities
 add column entry_kind text not null default 'legacy_opportunity',
 add column source_identity jsonb,
 alter column channel drop not null,
 alter column audience_need drop not null,
 alter column proposed_action drop not null,
 alter column rationale drop not null,
 drop constraint growth_opportunities_status_check,
 add constraint growth_opportunities_entry_shape check (coalesce(
  (entry_kind='legacy_opportunity' and source_identity is null
   and channel is not null and audience_need is not null and proposed_action is not null and rationale is not null
   and status in ('candidate','in_review','approved','rejected','published','measured'))
  or (entry_kind='url_result' and status='url_pending_review' and site_id is null
   and channel is null and audience_need is null and proposed_action is null and rationale is null
   and impact_score is null and effort_score is null and evidence_confidence='low'
   and source_identity is not null and jsonb_typeof(source_identity)='object'),false));

create function private.url_source_identity(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('original_url',p#>'{snapshot,original_url}','final_url',p#>'{snapshot,final_url}',
 'snapshot_id',p#>'{snapshot,id}','source_version',p#>'{snapshot,version}','source_digest',p#>'{snapshot,content_fingerprint}') $$;
revoke all on function private.url_source_identity(jsonb) from public,anon,authenticated,service_role;

create function private.guard_url_parent() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.entry_kind is distinct from old.entry_kind or new.organization_id is distinct from old.organization_id
  or new.id is distinct from old.id or new.source_identity is distinct from old.source_identity) then
  raise exception 'Parent identity is immutable' using errcode='23514'; end if;
 if new.entry_kind='url_result' then
  if not coalesce(private.fr_keys(new.source_identity,array['original_url','final_url','snapshot_id','source_version','source_digest'])
   and private.fr_url(new.source_identity->'original_url') and private.fr_url(new.source_identity->'final_url')
   and jsonb_typeof(new.source_identity->'snapshot_id')='string' and jsonb_typeof(new.source_identity->'source_version')='string' and jsonb_typeof(new.source_identity->'source_digest')='string'
   and new.source_identity->>'snapshot_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   and new.source_identity->>'source_version' ~ '^[0-9a-f]{64}$'
   and new.source_identity->>'source_digest'='sha256:'||(new.source_identity->>'source_version'),false)
  then raise exception 'Invalid URL source identity' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_url_parent() from public,anon,authenticated,service_role;
create trigger guard_url_parent before insert or update on public.growth_opportunities for each row execute function private.guard_url_parent();

create function private.guard_url_version() returns trigger language plpgsql set search_path='' as $$
declare parent public.growth_opportunities%rowtype;
begin
 if TG_OP='UPDATE' and (old.organization_id is distinct from new.organization_id or old.opportunity_id is distinct from new.opportunity_id) then
  raise exception 'Version parent is immutable' using errcode='23514'; end if;
 select * into parent from public.growth_opportunities where organization_id=new.organization_id and id=new.opportunity_id;
 if parent.entry_kind='url_result' and (new.first_result_payload is null or
  private.url_source_identity(new.first_result_payload) is distinct from parent.source_identity) then
  raise exception 'URL version source binding mismatch' using errcode='23514'; end if;
 -- Existing typed CHECK performs full evidence/hash validation, including direct writes.
 return new;
end $$;
revoke all on function private.guard_url_version() from public,anon,authenticated,service_role;
create trigger guard_url_version before insert or update on public.content_versions for each row execute function private.guard_url_version();

-- Add a fail-closed subtype guard to every existing entry point, keeping its body,
-- signatures and ACLs. Insert only AFTER the original owner/org authorization;
-- a SECURITY DEFINER subtype lookup must not expose other tenants to callers.
do $patch$
declare signature text; definition text; guard text; body_start integer; auth_end integer; auth_prefix text;
begin
 foreach signature in array array[
 'private.review_growth_opportunity_impl(uuid,uuid,text,text)',
 'private.create_content_draft_impl(uuid,uuid,text,text)',
 'private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)',
 'private.review_content_draft_impl(uuid,uuid,text,text)',
 'private.plan_content_action_impl(uuid,uuid,text,text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if signature like '%review_content_draft%' or signature like '%plan_content_action%' then
   guard:='if exists(select 1 from public.content_versions v join public.growth_opportunities p on p.organization_id=v.organization_id and p.id=v.opportunity_id where v.organization_id=p_organization_id and v.id=p_version_id and p.entry_kind<>''legacy_opportunity'') then raise exception ''URL result requires dedicated review'' using errcode=''23514''; end if;';
  else
   guard:='if exists(select 1 from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id and entry_kind<>''legacy_opportunity'') then raise exception ''URL result cannot use legacy mutation'' using errcode=''23514''; end if;';
  end if;
  if position(E'begin\n' in definition)=0 then raise exception 'Unexpected function body: %',signature; end if;
  body_start:=position(E'begin\n' in definition)+length(E'begin\n');
  auth_end:=position('end if;' in substring(definition from body_start));
  if auth_end=0 then raise exception 'Missing authorization block: %',signature; end if;
  auth_prefix:=substring(definition from body_start for auth_end+length('end if;')-1);
  if auth_prefix !~ '^\s*if (v_actor|actor) is null or not private\.has_org_role\(p_organization_id,\s*array\[''owner''\](::text\[\])?\) then'
   or position('errcode=''42501''' in replace(auth_prefix,' ',''))=0 then
   raise exception 'Unexpected authorization block: %',signature;
  end if;
  auth_end:=body_start+length(auth_prefix);
  execute overlay(definition placing E'\n '||guard||E'\n' from auth_end for 0);
 end loop;
end $patch$;

create function private.save_url_result_draft_impl(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare cutoff constant timestamptz := '2099-01-01T00:00:00.000Z'; actor uuid:=auth.uid(); old public.content_versions%rowtype; parent public.growth_opportunities%rowtype;
 latest integer; result_id uuid; fingerprint text; created_parent boolean:=false;
begin
 if actor is distinct from 'e85f1a90-3565-4fc1-a7e0-3b7d08830d0e'::uuid or p_organization_id is distinct from '93a88055-0a0b-40c0-b22f-a6d312320001'::uuid or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Bound owner required' using errcode='42501'; end if;
 if p_opportunity_id is distinct from '9bafbb2f-eea7-48ea-bc23-3896897f19c3'::uuid or p_request_id is distinct from '4d602b3f-272f-4282-9906-b0cc0155e1c7'::uuid or p_expected_version is distinct from 0 then raise exception 'Bound request required' using errcode='42501'; end if;
 if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_opportunity_id is not null and p_request_id is not null and p_expected_version between 0 and 2147483646 and p_payload is not null,'INVALID_REQUEST');
 perform 1 from public.organizations where id=p_organization_id for no key update;
 if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);
 if fingerprint is distinct from 'pg-jsonb-sha256:4cc5a9523bbccf6f0d976ce08b78ed3b7763cd69d18ee7bf34b00310e5f5f7a5' then raise exception 'Bound payload required' using errcode='22023'; end if;
 select * into old from public.content_versions where organization_id=p_organization_id and first_result_request_id=p_request_id;
 if found then
  if old.created_by<>actor or old.opportunity_id<>p_opportunity_id or old.first_result_expected_version<>p_expected_version
   or old.first_result_payload is distinct from p_payload or old.first_result_request_digest<>fingerprint
   or not exists(select 1 from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id and entry_kind='url_result') then
   raise exception 'Request ID payload differs' using errcode='22023'; end if;
  if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
  return old.id;
 end if;
 perform private.fr_require(private.fr_valid_payload(p_payload),'INVALID_PAYLOAD');
 select * into parent from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id for update;
 if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 if not found then
  if p_expected_version<>0 then raise exception 'URL parent missing' using errcode='PT409'; end if;
  -- Primary key also rejects a foreign-org UUID collision without reparenting.
   if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
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
  if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,
 first_result_payload,first_result_request_id,first_result_expected_version,first_result_request_digest)
 values(p_organization_id,p_opportunity_id,latest+1,p_payload#>>'{preview,fields,title,suggested}',p_payload#>>'{preview,fields,description,suggested}',actor,
 p_payload,p_request_id,p_expected_version,fingerprint) returning id into result_id;
  if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'url_result_draft_saved','content_version',result_id,jsonb_build_object('request_id',p_request_id,'version_number',latest+1,
 'opportunity_id',p_opportunity_id,'created_parent',created_parent,'source_digest',p_payload#>>'{snapshot,content_fingerprint}',
 'content_digest',private.fr_content_digest(p_payload),'request_digest',fingerprint,'provenance','caller_supplied_unverified','approval','none'));
 if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;
 return result_id;
end $$;
create function public.save_url_result_draft(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.save_url_result_draft_impl($1,$2,$3,$4,$5) $$;
revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;

grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;
$url_ddl$;
END $bound_open$;
