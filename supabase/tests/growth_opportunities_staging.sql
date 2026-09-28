-- Isolated Growth OS Staging only. Synthetic rows and Auth identities roll back.
-- Simulated JWT claims test RLS; this does not create real sessions or exercise server writes.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('93a88055-0a0b-40c0-b22f-a6d312410001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-queue-a@example.invalid',now(),now()),
  ('93a88055-0a0b-40c0-b22f-a6d312410002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-queue-b@example.invalid',now(),now());
insert into public.organizations (id,name,business_model) values
  ('93a88055-0a0b-40c0-b22f-a6d312420001','Growth Queue A','ecommerce'),
  ('93a88055-0a0b-40c0-b22f-a6d312420002','Growth Queue B','trade');
insert into public.organization_members (organization_id,user_id,role) values
  ('93a88055-0a0b-40c0-b22f-a6d312420001','93a88055-0a0b-40c0-b22f-a6d312410001','owner'),
  ('93a88055-0a0b-40c0-b22f-a6d312420002','93a88055-0a0b-40c0-b22f-a6d312410002','viewer');
insert into public.sites (id,organization_id,origin) values
  ('93a88055-0a0b-40c0-b22f-a6d312430001','93a88055-0a0b-40c0-b22f-a6d312420001','https://growth-queue-a.example.invalid'),
  ('93a88055-0a0b-40c0-b22f-a6d312430002','93a88055-0a0b-40c0-b22f-a6d312420002','https://growth-queue-b.example.invalid');
insert into public.business_profiles (id,organization_id,site_id,display_name,audience_summary,offering_summary,primary_outcome,target_market) values
  ('93a88055-0a0b-40c0-b22f-a6d312440001','93a88055-0a0b-40c0-b22f-a6d312420001','93a88055-0a0b-40c0-b22f-a6d312430001','A catalog','Synthetic buyer','Synthetic products','order','Taiwan'),
  ('93a88055-0a0b-40c0-b22f-a6d312440002','93a88055-0a0b-40c0-b22f-a6d312420002','93a88055-0a0b-40c0-b22f-a6d312430002','B catalog','Synthetic buyer','Synthetic products','qualified_lead','Taiwan');
insert into public.growth_opportunities (id,organization_id,site_id,channel,audience_need,proposed_action,rationale) values
  ('93a88055-0a0b-40c0-b22f-a6d312450001','93a88055-0a0b-40c0-b22f-a6d312420001','93a88055-0a0b-40c0-b22f-a6d312430001','organic_search','Compare synthetic specifications','Draft a comparison page','First-party catalog gap'),
  ('93a88055-0a0b-40c0-b22f-a6d312450002','93a88055-0a0b-40c0-b22f-a6d312420002','93a88055-0a0b-40c0-b22f-a6d312430002','owned_content','Explain synthetic purchasing terms','Draft a guide','Owner question');
insert into public.opportunity_sources (id,organization_id,opportunity_id,source_kind,evidence_note,observed_at) values
  ('93a88055-0a0b-40c0-b22f-a6d312460001','93a88055-0a0b-40c0-b22f-a6d312420001','93a88055-0a0b-40c0-b22f-a6d312450001','product_catalog','Synthetic catalog has no comparison',now()),
  ('93a88055-0a0b-40c0-b22f-a6d312460002','93a88055-0a0b-40c0-b22f-a6d312420002','93a88055-0a0b-40c0-b22f-a6d312450002','owner_question','Synthetic owner question',now());
insert into public.opportunity_decisions (id,organization_id,opportunity_id,actor_user_id,decision,reason) values
  ('93a88055-0a0b-40c0-b22f-a6d312470001','93a88055-0a0b-40c0-b22f-a6d312420001','93a88055-0a0b-40c0-b22f-a6d312450001','93a88055-0a0b-40c0-b22f-a6d312410001','approved','Synthetic review'),
  ('93a88055-0a0b-40c0-b22f-a6d312470002','93a88055-0a0b-40c0-b22f-a6d312420002','93a88055-0a0b-40c0-b22f-a6d312450002','93a88055-0a0b-40c0-b22f-a6d312410002','rejected','Synthetic review');

do $$
declare tbl text;
begin
  foreach tbl in array array['business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relname=tbl and c.relrowsecurity) then
      raise exception 'RLS disabled on %', tbl;
    end if;
    if exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and cmd <> 'SELECT') then
      raise exception 'write policy exists on %', tbl;
    end if;
    if has_table_privilege('anon', format('public.%I',tbl), 'SELECT') then
      raise exception 'anon grant exists on %', tbl;
    end if;
    if has_table_privilege('authenticated', format('public.%I',tbl), 'INSERT, UPDATE, DELETE') then
      raise exception 'authenticated write grant exists on %', tbl;
    end if;
  end loop;
  begin
    insert into public.opportunity_sources (organization_id,opportunity_id,source_kind,evidence_note,observed_at)
    values ('93a88055-0a0b-40c0-b22f-a6d312420001','93a88055-0a0b-40c0-b22f-a6d312450002','owner_question','Cross-tenant attempt',now());
    raise exception 'cross-tenant source unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','93a88055-0a0b-40c0-b22f-a6d312410001',true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions'] loop
    execute format('select count(*) from public.%I',tbl) into n;
    if n <> 1 then raise exception 'A sees % rows in %',n,tbl; end if;
    begin
      execute format('update public.%I set organization_id=organization_id',tbl);
      raise exception 'authenticated UPDATE allowed on %',tbl;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('delete from public.%I',tbl);
      raise exception 'authenticated DELETE allowed on %',tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.growth_opportunities (organization_id,channel,audience_need,proposed_action,rationale)
    values ('93a88055-0a0b-40c0-b22f-a6d312420001','organic_search','Write attempt','Write attempt','Write attempt');
    raise exception 'authenticated INSERT allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','93a88055-0a0b-40c0-b22f-a6d312410002',true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions'] loop
    execute format('select count(*) from public.%I',tbl) into n;
    if n <> 1 then raise exception 'B sees % rows in %',n,tbl; end if;
  end loop;
end $$;

select set_config('request.jwt.claim.sub','93a88055-0a0b-40c0-b22f-a6d312410003',true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions'] loop
    execute format('select count(*) from public.%I',tbl) into n;
    if n <> 0 then raise exception 'nonmember sees % rows in %',n,tbl; end if;
  end loop;
end $$;

reset role;
delete from public.organization_members where user_id='93a88055-0a0b-40c0-b22f-a6d312410001';
set local role authenticated;
select set_config('request.jwt.claim.sub','93a88055-0a0b-40c0-b22f-a6d312410001',true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions'] loop
    execute format('select count(*) from public.%I',tbl) into n;
    if n <> 0 then raise exception 'revoked A sees % rows in %',n,tbl; end if;
  end loop;
end $$;

reset role;
rollback;
select 'PASS: 4 tables, A/B/nonmember/revoked isolation, write denial and cross-tenant FK; rolled back' as result;
