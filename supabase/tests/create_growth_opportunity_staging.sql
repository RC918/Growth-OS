-- Isolated Growth OS Staging; synthetic identities and rows roll back.
begin;

insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values
 ('73a88055-0a0b-40c0-b22f-a6d312410001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','create-owner-a@example.invalid',now(),now()),
 ('73a88055-0a0b-40c0-b22f-a6d312410002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','create-viewer-a@example.invalid',now(),now()),
 ('73a88055-0a0b-40c0-b22f-a6d312410003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','create-owner-b@example.invalid',now(),now());
insert into public.organizations (id,name,business_model) values
 ('73a88055-0a0b-40c0-b22f-a6d312420001','Create A','ecommerce'),
 ('73a88055-0a0b-40c0-b22f-a6d312420002','Create B','trade');
insert into public.organization_members (organization_id,user_id,role) values
 ('73a88055-0a0b-40c0-b22f-a6d312420001','73a88055-0a0b-40c0-b22f-a6d312410001','owner'),
 ('73a88055-0a0b-40c0-b22f-a6d312420001','73a88055-0a0b-40c0-b22f-a6d312410002','viewer'),
 ('73a88055-0a0b-40c0-b22f-a6d312420002','73a88055-0a0b-40c0-b22f-a6d312410003','owner');
insert into public.sites (id,organization_id,origin,verified_at) values
 ('73a88055-0a0b-40c0-b22f-a6d312430001','73a88055-0a0b-40c0-b22f-a6d312420001','https://a.example.invalid',now()),
 ('73a88055-0a0b-40c0-b22f-a6d312430002','73a88055-0a0b-40c0-b22f-a6d312420001','https://pending.example.invalid',null),
 ('73a88055-0a0b-40c0-b22f-a6d312430003','73a88055-0a0b-40c0-b22f-a6d312420002','https://b.example.invalid',now());

do $$ begin
 if has_function_privilege('anon','public.create_growth_opportunity(uuid,uuid,text,text,text,text,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.create_growth_opportunity(uuid,uuid,text,text,text,text,text,text)','EXECUTE') then
   raise exception 'RPC grants incorrect';
 end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','73a88055-0a0b-40c0-b22f-a6d312410002',true);
do $$ begin
 begin
   perform public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',null,'organic_search','Need','Action','Reason','owner_question','Question');
   raise exception 'viewer created';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub','73a88055-0a0b-40c0-b22f-a6d312410003',true);
do $$ begin
 begin
   perform public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',null,'organic_search','Need','Action','Reason','research_note','Note');
   raise exception 'cross tenant created';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub','73a88055-0a0b-40c0-b22f-a6d312410001',true);
do $$ begin
 begin
   perform public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001','73a88055-0a0b-40c0-b22f-a6d312430002','organic_search','Need','Action','Reason','owner_question','Question');
   raise exception 'unverified site allowed';
 exception when check_violation then null;
 end;
 begin
   perform public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001','73a88055-0a0b-40c0-b22f-a6d312430003','organic_search','Need','Action','Reason','owner_question','Question');
   raise exception 'other tenant site allowed';
 exception when check_violation then null;
 end;
 begin
   perform public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',null,'organic_search','Need','Action','Reason','gsc_query','Unverified metric');
   raise exception 'GSC spoofed';
 exception when invalid_parameter_value then null;
 end;
 begin
   perform public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',null,'organic_search','Need','Action','Reason','owner_question','  ');
   raise exception 'empty evidence accepted';
 exception when invalid_parameter_value then null;
 end;
end $$;

select public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',
 '73a88055-0a0b-40c0-b22f-a6d312430001','organic_search',
 'Compare synthetic products','Draft a comparison guide','Owner reports repeated buyer question',
 'owner_question','Owner reports buyers asking about two models');
select public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',
 null,'owned_content','Understand synthetic trade terms','Draft a glossary',
 'Owner has a research hypothesis','research_note','Owner-supplied research note');

do $$
declare v_id uuid;
begin
 v_id := public.create_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',
   null,'distribution','Find the right synthetic buyer','Draft an outreach outline',
   'Owner reports a frequent question','owner_question','Owner-supplied question');
 perform public.review_growth_opportunity('73a88055-0a0b-40c0-b22f-a6d312420001',
   v_id,'approved','Owner approves the draft idea');
end $$;

reset role;
do $$ begin
 if (select count(*) from public.growth_opportunities where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001') <> 3
   or (select count(*) from public.opportunity_sources where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001') <> 3
   or (select count(*) from public.audit_events where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and event_type='growth_opportunity_created') <> 3
   or (select count(*) from public.growth_opportunities where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and status='candidate') <> 2
   or (select count(*) from public.growth_opportunities where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and status='approved') <> 1
   or (select count(*) from public.opportunity_decisions where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001') <> 1
   or (select count(*) from public.audit_events where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and event_type='growth_opportunity_reviewed') <> 1
   or exists(select 1 from public.growth_opportunities where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and (evidence_confidence <> 'low' or impact_score is not null or effort_score is not null))
   or exists(select 1 from public.opportunity_sources where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and (source_kind not in ('owner_question','research_note') or source_url is not null))
   or exists(select 1 from public.audit_events where organization_id='73a88055-0a0b-40c0-b22f-a6d312420001' and event_type='growth_opportunity_created' and actor_user_id <> '73a88055-0a0b-40c0-b22f-a6d312410001') then
   raise exception 'candidate/source/audit consistency failed';
 end if;
end $$;

rollback;
select 'PASS: owner-only first-party candidates; tenant/site/source restrictions and atomic audit; rolled back' as result;
