-- Run only against the isolated Growth OS Supabase Staging project.
-- All synthetic rows are created and checked in one transaction, then rolled back.
-- This simulates PostgREST role/JWT claims. It is NOT a real Auth session test.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('93a88055-0a0b-40c0-b22f-a6d312210001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'growth-os-rls-a@example.invalid', now(), now()),
  ('93a88055-0a0b-40c0-b22f-a6d312210002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'growth-os-rls-b@example.invalid', now(), now());

insert into public.organizations (id, name, business_model) values
  ('93a88055-0a0b-40c0-b22f-a6d312220001', 'Synthetic A', 'ecommerce'),
  ('93a88055-0a0b-40c0-b22f-a6d312220002', 'Synthetic B', 'trade');
insert into public.organization_members (organization_id, user_id, role) values
  ('93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312210001', 'owner'),
  ('93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312210002', 'viewer');
insert into public.sites (id, organization_id, origin) values
  ('93a88055-0a0b-40c0-b22f-a6d312230001', '93a88055-0a0b-40c0-b22f-a6d312220001', 'https://synthetic-a.example.invalid'),
  ('93a88055-0a0b-40c0-b22f-a6d312230002', '93a88055-0a0b-40c0-b22f-a6d312220002', 'https://synthetic-b.example.invalid');
insert into public.scans (id, organization_id, site_id, requested_url) values
  ('93a88055-0a0b-40c0-b22f-a6d312240001', '93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312230001', 'https://synthetic-a.example.invalid'),
  ('93a88055-0a0b-40c0-b22f-a6d312240002', '93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312230002', 'https://synthetic-b.example.invalid');
insert into public.findings (id, organization_id, scan_id, rule_code, severity, evidence_url, observed_at, confidence) values
  ('93a88055-0a0b-40c0-b22f-a6d312250001', '93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312240001', 'synthetic', 'info', 'https://synthetic-a.example.invalid', now(), 'low'),
  ('93a88055-0a0b-40c0-b22f-a6d312250002', '93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312240002', 'synthetic', 'info', 'https://synthetic-b.example.invalid', now(), 'low');
insert into public.import_batches (id, organization_id, site_id, source, idempotency_key) values
  ('93a88055-0a0b-40c0-b22f-a6d312260001', '93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312230001', 'ga4', 'synthetic-a'),
  ('93a88055-0a0b-40c0-b22f-a6d312260002', '93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312230002', 'ga4', 'synthetic-b');
insert into public.funnel_daily (id, organization_id, site_id, import_batch_id, report_date, source, medium) values
  ('93a88055-0a0b-40c0-b22f-a6d312270001', '93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312230001', '93a88055-0a0b-40c0-b22f-a6d312260001', current_date, 'synthetic-a', 'test'),
  ('93a88055-0a0b-40c0-b22f-a6d312270002', '93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312230002', '93a88055-0a0b-40c0-b22f-a6d312260002', current_date, 'synthetic-b', 'test');
insert into public.recommendations (id, organization_id, site_id, finding_id, title, rationale, evidence_type) values
  ('93a88055-0a0b-40c0-b22f-a6d312280001', '93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312230001', '93a88055-0a0b-40c0-b22f-a6d312250001', 'Synthetic A', 'test', 'observed'),
  ('93a88055-0a0b-40c0-b22f-a6d312280002', '93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312230002', '93a88055-0a0b-40c0-b22f-a6d312250002', 'Synthetic B', 'test', 'observed');
insert into public.actions (id, organization_id, recommendation_id) values
  ('93a88055-0a0b-40c0-b22f-a6d312290001', '93a88055-0a0b-40c0-b22f-a6d312220001', '93a88055-0a0b-40c0-b22f-a6d312280001'),
  ('93a88055-0a0b-40c0-b22f-a6d312290002', '93a88055-0a0b-40c0-b22f-a6d312220002', '93a88055-0a0b-40c0-b22f-a6d312280002');
insert into public.audit_events (id, organization_id, event_type, object_type) values
  ('93a88055-0a0b-40c0-b22f-a6d3122a0001', '93a88055-0a0b-40c0-b22f-a6d312220001', 'synthetic', 'test'),
  ('93a88055-0a0b-40c0-b22f-a6d3122a0002', '93a88055-0a0b-40c0-b22f-a6d312220002', 'synthetic', 'test');

-- RLS policy inventory guards against accidental write-policy additions.
do $$
declare tbl text;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=tbl and c.relrowsecurity) then
      raise exception 'RLS disabled on %', tbl;
    end if;
    if (select count(*) from pg_policies where schemaname='public' and tablename=tbl and cmd <> 'SELECT') <> 0 then
      raise exception 'unexpected write policy on %', tbl;
    end if;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '93a88055-0a0b-40c0-b22f-a6d312210001', true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    if n <> 1 then raise exception 'owner A sees % rows in %, expected 1', n, tbl; end if;
  end loop;
  if private.has_org_role('93a88055-0a0b-40c0-b22f-a6d312220002', array['owner','editor','viewer']) then
    raise exception 'A was granted access to B';
  end if;
end $$;

-- Direct writes are denied even for owners. UPDATE/DELETE affect zero rows;
-- INSERT raises an RLS error. Check a valid insert, not DEFAULT VALUES.
do $$
declare tbl text; n integer; stmt text;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    if tbl = 'organization_members' then
      execute 'update public.organization_members set role = role';
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'UPDATE allowed on %', tbl; end if;
      execute 'delete from public.organization_members';
    else
      execute format('update public.%I set id=id', tbl);
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'UPDATE allowed on %', tbl; end if;
      execute format('delete from public.%I', tbl);
    end if;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'DELETE allowed on %', tbl; end if;
  end loop;
  foreach stmt in array array[
    $sql$insert into public.organizations (name,business_model) values ('not-allowed','trade')$sql$,
    $sql$insert into public.organization_members (organization_id,user_id,role) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312210002','viewer')$sql$,
    $sql$insert into public.sites (organization_id,origin) values ('93a88055-0a0b-40c0-b22f-a6d312220001','https://write.example.invalid')$sql$,
    $sql$insert into public.scans (organization_id,site_id,requested_url) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312230001','https://write.example.invalid')$sql$,
    $sql$insert into public.findings (organization_id,scan_id,rule_code,severity,evidence_url,observed_at,confidence) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312240001','write-attempt','info','https://write.example.invalid',now(),'low')$sql$,
    $sql$insert into public.import_batches (organization_id,site_id,source,idempotency_key) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312230001','ga4','write-attempt')$sql$,
    $sql$insert into public.funnel_daily (organization_id,site_id,import_batch_id,report_date,source,medium) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312230001','93a88055-0a0b-40c0-b22f-a6d312260001',current_date,'write-attempt','test')$sql$,
    $sql$insert into public.recommendations (organization_id,site_id,title,rationale,evidence_type) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312230001','write-attempt','test','observed')$sql$,
    $sql$insert into public.actions (organization_id,recommendation_id) values ('93a88055-0a0b-40c0-b22f-a6d312220001','93a88055-0a0b-40c0-b22f-a6d312280001')$sql$,
    $sql$insert into public.audit_events (organization_id,event_type,object_type) values ('93a88055-0a0b-40c0-b22f-a6d312220001','write-attempt','test')$sql$
  ] loop
    begin
      execute stmt;
      raise exception 'INSERT unexpectedly allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

select set_config('request.jwt.claim.sub', '93a88055-0a0b-40c0-b22f-a6d312210002', true);
do $$
declare tbl text; n integer; expected integer;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    expected := case when tbl='audit_events' then 0 else 1 end;
    execute format('select count(*) from public.%I', tbl) into n;
    if n <> expected then raise exception 'viewer B sees % rows in %, expected %', n, tbl, expected; end if;
  end loop;
end $$;

select set_config('request.jwt.claim.sub', '93a88055-0a0b-40c0-b22f-a6d312210003', true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    if n <> 0 then raise exception 'nonmember sees % rows in %', n, tbl; end if;
  end loop;
end $$;

reset role;
delete from public.organization_members where user_id='93a88055-0a0b-40c0-b22f-a6d312210001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '93a88055-0a0b-40c0-b22f-a6d312210001', true);
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    if n <> 0 then raise exception 'revoked A sees % rows in %', n, tbl; end if;
  end loop;
end $$;

set local role anon;
do $$
declare tbl text; n integer;
begin
  foreach tbl in array array['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    if n <> 0 then raise exception 'anon sees % rows in %', n, tbl; end if;
  end loop;
end $$;

reset role;
rollback;
select 'PASS: 10 tables, owner/viewer/nonmember/anon, write denial, revocation; transaction rolled back' as result;
