-- Disposable acceptance against the isolated Auth fixtures. All draft writes roll back.
begin;
do $$ begin
  if has_table_privilege('authenticated','public.content_versions','INSERT')
    or has_table_privilege('authenticated','public.content_versions','UPDATE')
    or has_function_privilege('anon','public.create_content_draft(uuid,uuid,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.create_content_draft(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'Draft grants incorrect';
  end if;
end $$;

select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and role='owner' limit 1
),true);
set local role authenticated;
do $$
declare v_opportunity uuid; v_org uuid := '93a88055-0a0b-40c0-b22f-a6d312320001';
begin
  select id into v_opportunity from public.growth_opportunities
   where organization_id=v_org and status='approved' limit 1;
  if v_opportunity is null then raise exception 'Approved fixture missing'; end if;
  perform public.create_content_draft(v_org,v_opportunity,'Synthetic title 1','Synthetic body 1');
  perform public.create_content_draft(v_org,v_opportunity,'Synthetic title 2','Synthetic body 2');
  if (select count(*) from public.content_versions where organization_id=v_org and opportunity_id=v_opportunity) <> 2
    or (select max(version_number) from public.content_versions where organization_id=v_org and opportunity_id=v_opportunity) <> 2
    or (select count(*) from public.audit_events where organization_id=v_org and event_type='content_draft_created') <> 2 then
    raise exception 'Version sequence or audit failed';
  end if;
  begin
    perform public.create_content_draft(v_org,v_opportunity,' ','Empty body test');
    raise exception 'Empty draft accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_content_draft(v_org,(
      select id from public.growth_opportunities where organization_id=v_org and status='rejected' limit 1
    ),'Rejected','Not approved');
    raise exception 'Rejected draft accepted';
  exception when check_violation then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' limit 1
),true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.content_versions where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001') then
    raise exception 'Cross-tenant draft leak';
  end if;
  begin
    perform public.create_content_draft('93a88055-0a0b-40c0-b22f-a6d312320001',
      '00000000-0000-0000-0000-000000000000','Cross tenant','Forbidden');
    raise exception 'Cross-tenant draft accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_content_draft('93a88055-0a0b-40c0-b22f-a6d312320002',
      '00000000-0000-0000-0000-000000000000','Viewer','Forbidden');
    raise exception 'Viewer draft accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: owner version sequence, audit, read isolation, viewer/cross-tenant/unapproved/empty denial; rolled back' as result;
