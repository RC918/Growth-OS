-- OFFLINE CANDIDATE ONLY. No migration installation or runtime grant authorized.
-- Reuse the existing immutable-per-version review, member RLS and audit model.
alter table public.content_reviews
 add column url_review_request_id uuid,
 add column url_review_source_digest text,
 add column url_review_content_digest text,
 add column url_review_version_digest text,
 add column url_review_checks jsonb,
 add constraint content_reviews_url_request_unique unique(organization_id,url_review_request_id),
 add constraint content_reviews_url_shape check (
  (url_review_request_id is null and url_review_source_digest is null and url_review_content_digest is null and url_review_version_digest is null and url_review_checks is null)
  or coalesce(url_review_request_id is not null and decision='approved'
   and url_review_source_digest ~ '^sha256:[a-f0-9]{64}$' and url_review_content_digest ~ '^sha256:[a-f0-9]{64}$'
   and url_review_version_digest ~ '^pg-jsonb-sha256:[a-f0-9]{64}$'
   and url_review_checks='{"title":true,"meta_description":true,"description":true,"source":true,"blocking_facts_clear":true}'::jsonb,false));

create function private.review_url_result_impl(p_organization_id uuid,p_version_id uuid,p_request_id uuid,p_source_digest text,p_content_digest text,p_version_digest text,p_checks jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); v public.content_versions%rowtype; parent public.growth_opportunities%rowtype; prior public.content_reviews%rowtype; result_id uuid;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_version_id is not null and p_request_id is not null and p_checks='{"title":true,"meta_description":true,"description":true,"source":true,"blocking_facts_clear":true}'::jsonb,'EXACT_REVIEW_CHECKS_REQUIRED');
 -- Same lock order as URL Save; membership is rechecked after waiting.
 perform 1 from public.organizations where id=p_organization_id for no key update;
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 select * into v from public.content_versions where organization_id=p_organization_id and id=p_version_id;
 if not found then raise exception 'Exact version missing' using errcode='P0002'; end if;
 select * into parent from public.growth_opportunities where organization_id=p_organization_id and id=v.opportunity_id for update;
 if not found or parent.entry_kind<>'url_result' or parent.status<>'url_pending_review' then raise exception 'URL parent required' using errcode='23514'; end if;
 -- Re-read under the parent lock; legacy mutation guards remain untouched.
 select * into v from public.content_versions where organization_id=p_organization_id and id=p_version_id for share;
 if not found or v.status<>'draft' or v.first_result_payload is null then raise exception 'Typed draft required' using errcode='23514'; end if;
 perform private.fr_require(private.fr_valid_payload(v.first_result_payload),'INVALID_PAYLOAD');
 if parent.source_identity is distinct from private.url_source_identity(v.first_result_payload)
  or p_source_digest is distinct from v.first_result_payload#>>'{snapshot,content_fingerprint}'
  or p_content_digest is distinct from private.fr_content_digest(v.first_result_payload)
  or p_version_digest is distinct from v.first_result_request_digest then raise exception 'Review binding mismatch' using errcode='22023'; end if;
 select * into prior from public.content_reviews where organization_id=p_organization_id and url_review_request_id=p_request_id;
 if found then
  if prior.actor_user_id is distinct from actor or prior.version_id is distinct from p_version_id or prior.url_review_source_digest is distinct from p_source_digest or prior.url_review_content_digest is distinct from p_content_digest or prior.url_review_version_digest is distinct from p_version_digest or prior.url_review_checks is distinct from p_checks then raise exception 'Review request differs' using errcode='22023'; end if;
  return prior.id; -- An exact replay returns history, never promotes a newer version.
 end if;
 if v.version_number<>(select max(version_number) from public.content_versions where organization_id=p_organization_id and opportunity_id=v.opportunity_id) then raise exception 'Only latest URL version can be confirmed' using errcode='PT409'; end if;
 if exists(select 1 from public.content_reviews where organization_id=p_organization_id and version_id=p_version_id) then raise exception 'Version already reviewed; read exact review' using errcode='PT409'; end if;
 insert into public.content_reviews(organization_id,version_id,actor_user_id,decision,reason,url_review_request_id,url_review_source_digest,url_review_content_digest,url_review_version_digest,url_review_checks)
 values(p_organization_id,p_version_id,actor,'approved','已核對原文、修改、來源及相關事實；未發布',p_request_id,p_source_digest,p_content_digest,p_version_digest,p_checks) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'url_result_reviewed','content_version',p_version_id,jsonb_build_object('review_id',result_id,'request_id',p_request_id,'version_number',v.version_number,'source_digest',p_source_digest,'content_digest',p_content_digest,'version_digest',p_version_digest,'published',false));
 return result_id;
end $$;
create function public.review_url_result(p_organization_id uuid,p_version_id uuid,p_request_id uuid,p_source_digest text,p_content_digest text,p_version_digest text,p_checks jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.review_url_result_impl($1,$2,$3,$4,$5,$6,$7)$$;
revoke all on function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb),private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
-- Existing table grants/RLS are unchanged. Test harness alone grants execution locally.
