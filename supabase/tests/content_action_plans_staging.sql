-- Uses synthetic Auth fixtures. All writes below are rolled back.
begin;
do $$ begin
  if has_table_privilege('authenticated','public.content_action_plans','INSERT')
     or has_table_privilege('authenticated','public.content_action_plans','UPDATE')
     or has_function_privilege('anon','public.plan_content_action(uuid,uuid,text,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.plan_content_action(uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'Action plan grants incorrect';
  end if;
end $$;

select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and role='owner' limit 1
),true);
set local role authenticated;
do $$
declare
  v_org uuid := '93a88055-0a0b-40c0-b22f-a6d312320001';
  v_opportunity uuid;
  v_rejected uuid;
  v_third uuid;
  v_fourth uuid;
  v_plan uuid;
begin
  select opportunity_id into v_opportunity from public.content_versions
   where organization_id=v_org limit 1;
  if v_opportunity is null then raise exception 'Synthetic fixture missing'; end if;
  select v.id into v_rejected from public.content_versions v
   join public.content_reviews r on r.organization_id=v.organization_id and r.version_id=v.id
   where v.organization_id=v_org and v.opportunity_id=v_opportunity and r.decision='rejected' limit 1;
  if v_rejected is not null then
    begin
      perform public.plan_content_action(v_org,v_rejected,'/synthetic-rejected','Clicks','Remove page');
      raise exception 'Rejected version planned';
    exception when check_violation then null;
    end;
  end if;
  v_third := public.create_content_draft(v_org,v_opportunity,'Synthetic third version','Approved within rollback');
  perform public.review_content_draft(v_org,v_third,'approved','Synthetic check');
  v_fourth := public.create_content_draft(v_org,v_opportunity,'Synthetic fourth version','Latest version in rollback');
  begin
    perform public.plan_content_action(v_org,v_third,'/synthetic-stale','Clicks','Remove page');
    raise exception 'Historical version planned';
  exception when check_violation then null;
  end;
  begin
    perform public.plan_content_action(v_org,v_fourth,'/synthetic-unreviewed','Clicks','Remove page');
    raise exception 'Unreviewed version planned';
  exception when check_violation then null;
  end;
  perform public.review_content_draft(v_org,v_fourth,'approved','Synthetic claims checked');
  begin
    perform public.plan_content_action(v_org,v_fourth,'https://example.com','Clicks','Remove page');
    raise exception 'Absolute URL accepted';
  exception when invalid_parameter_value then null;
  end;
  v_plan := public.plan_content_action(v_org,v_fourth,'/synthetic-product-comparison',
    'Observe GSC impressions and clicks after publishing','Remove the page and keep the prior version');
  begin
    perform public.plan_content_action(v_org,v_fourth,'/duplicate','Clicks','Remove page');
    raise exception 'Duplicate action plan accepted';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.content_action_plans where id=v_plan and organization_id=v_org) <> 1
     or (select count(*) from public.audit_events where organization_id=v_org
         and object_id=v_fourth and event_type='content_action_planned') <> 1 then
    raise exception 'Action plan or audit missing';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' limit 1
),true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.content_action_plans
             where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001') then
    raise exception 'Cross-tenant action plan leaked';
  end if;
  begin
    perform public.plan_content_action('93a88055-0a0b-40c0-b22f-a6d312320001',
      '00000000-0000-0000-0000-000000000000','/foreign','Clicks','Remove page');
    raise exception 'Cross-tenant action accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.plan_content_action('93a88055-0a0b-40c0-b22f-a6d312320002',
      '00000000-0000-0000-0000-000000000000','/viewer','Clicks','Remove page');
    raise exception 'Viewer action accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: latest approved plan, audit, path validation, viewer and tenant denial; rolled back' as result;
