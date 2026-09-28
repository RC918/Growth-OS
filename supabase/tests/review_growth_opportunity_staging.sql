-- Growth OS isolated Staging: all fixture rows and decisions roll back.
-- JWT claims are simulated; a real Auth session/Data API test remains a gate.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('83a88055-0a0b-40c0-b22f-a6d312410001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','review-owner-a@example.invalid',now(),now()),
  ('83a88055-0a0b-40c0-b22f-a6d312410002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','review-viewer-a@example.invalid',now(),now()),
  ('83a88055-0a0b-40c0-b22f-a6d312410003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','review-owner-b@example.invalid',now(),now());
insert into public.organizations (id,name,business_model) values
  ('83a88055-0a0b-40c0-b22f-a6d312420001','Review A','ecommerce'),
  ('83a88055-0a0b-40c0-b22f-a6d312420002','Review B','trade');
insert into public.organization_members (organization_id,user_id,role) values
  ('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312410001','owner'),
  ('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312410002','viewer'),
  ('83a88055-0a0b-40c0-b22f-a6d312420002','83a88055-0a0b-40c0-b22f-a6d312410003','owner');
insert into public.growth_opportunities (id,organization_id,channel,audience_need,proposed_action,rationale) values
  ('83a88055-0a0b-40c0-b22f-a6d312450001','83a88055-0a0b-40c0-b22f-a6d312420001','organic_search','Synthetic buyer comparison','Draft comparison','Catalog gap'),
  ('83a88055-0a0b-40c0-b22f-a6d312450002','83a88055-0a0b-40c0-b22f-a6d312420001','owned_content','Synthetic buyer question','Draft guide','Question gap'),
  ('83a88055-0a0b-40c0-b22f-a6d312450003','83a88055-0a0b-40c0-b22f-a6d312420001','ai_discovery','Unproven need','Draft answer','Hypothesis only'),
  ('83a88055-0a0b-40c0-b22f-a6d312450004','83a88055-0a0b-40c0-b22f-a6d312420002','organic_search','B buyer need','Draft B guide','B catalog gap');
insert into public.opportunity_sources (organization_id,opportunity_id,source_kind,evidence_note,observed_at) values
  ('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','product_catalog','Synthetic gap',now()),
  ('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450002','owner_question','Synthetic question',now()),
  ('83a88055-0a0b-40c0-b22f-a6d312420002','83a88055-0a0b-40c0-b22f-a6d312450004','product_catalog','Synthetic B gap',now());

do $$ begin
  if has_function_privilege('anon','public.review_growth_opportunity(uuid,uuid,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.review_growth_opportunity(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'RPC grant incorrect';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','83a88055-0a0b-40c0-b22f-a6d312410002',true);
do $$ begin
  begin
    perform public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','approved','Viewer attempt');
    raise exception 'viewer approved';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','83a88055-0a0b-40c0-b22f-a6d312410003',true);
do $$ begin
  begin
    perform public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','approved','Cross tenant attempt');
    raise exception 'cross tenant approval';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','83a88055-0a0b-40c0-b22f-a6d312410001',true);
do $$ begin
  begin
    perform public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450003','approved','No source attempt');
    raise exception 'source-free approval';
  exception when check_violation then null;
  end;
  begin
    perform public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','published','Invalid decision');
    raise exception 'invalid decision accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','approved',' ');
    raise exception 'empty reason accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

select public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','approved','Owner reviewed source');
select public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450002','rejected','Evidence insufficient');
do $$ begin
  begin
    perform public.review_growth_opportunity('83a88055-0a0b-40c0-b22f-a6d312420001','83a88055-0a0b-40c0-b22f-a6d312450001','rejected','Duplicate');
    raise exception 'duplicate review accepted';
  exception when unique_violation then null;
  end;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.growth_opportunities where organization_id='83a88055-0a0b-40c0-b22f-a6d312420001' and status in ('approved','rejected')) <> 2
    or (select count(*) from public.opportunity_decisions where organization_id='83a88055-0a0b-40c0-b22f-a6d312420001') <> 2
    or (select count(*) from public.audit_events where organization_id='83a88055-0a0b-40c0-b22f-a6d312420001' and event_type='growth_opportunity_reviewed') <> 2
    or exists (select 1 from public.growth_opportunities where id='83a88055-0a0b-40c0-b22f-a6d312450003' and status <> 'candidate')
    or exists (select 1 from public.growth_opportunities where id='83a88055-0a0b-40c0-b22f-a6d312450004' and status <> 'candidate') then
    raise exception 'decision/status/audit consistency failed';
  end if;
  if exists (select 1 from public.opportunity_decisions where actor_user_id <> '83a88055-0a0b-40c0-b22f-a6d312410001') then
    raise exception 'actor mismatch';
  end if;
end $$;

rollback;
select 'PASS: owner decision, viewer/cross-tenant/no-source/invalid/duplicate denial, atomic audit; rolled back' as result;
