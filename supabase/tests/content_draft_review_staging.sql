-- Isolated Growth OS Auth fixture acceptance. No review or draft survives ROLLBACK.
begin;
do $$ begin
  if has_table_privilege('authenticated','public.content_reviews','INSERT')
     or has_table_privilege('authenticated','public.content_reviews','UPDATE')
     or has_function_privilege('anon','public.review_content_draft(uuid,uuid,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.review_content_draft(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'Review grants incorrect';
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
  v_second uuid;
  v_third uuid;
begin
  select opportunity_id into v_opportunity from public.content_versions
   where organization_id=v_org limit 1;
  if v_opportunity is null then raise exception 'Owner draft fixture missing'; end if;
  v_second := public.create_content_draft(v_org,v_opportunity,'Synthetic second version','Reviewed only in rollback');
  v_third := public.create_content_draft(v_org,v_opportunity,'Synthetic third version','Current latest version');
  begin
    perform public.review_content_draft(v_org,v_second,'approved','Stale approval attempt');
    raise exception 'Stale version approved';
  exception when check_violation then null;
  end;
  begin
    perform public.review_content_draft(v_org,v_third,'approved',' ');
    raise exception 'Empty reason accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.review_content_draft(v_org,v_third,'approved','Synthetic claims checked');
  begin
    perform public.review_content_draft(v_org,v_third,'rejected','Duplicate');
    raise exception 'Duplicate review accepted';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.content_reviews where organization_id=v_org and version_id=v_third) <> 1
    or (select count(*) from public.audit_events where organization_id=v_org and event_type='content_draft_reviewed') <> 1 then
    raise exception 'Review or audit missing';
  end if;
  -- A new version leaves the historical approval intact, but requires its own review.
  perform public.create_content_draft(v_org,v_opportunity,'Synthetic fourth version','Not approved yet');
  if not exists (select 1 from public.content_reviews where organization_id=v_org and version_id=v_third)
     or exists (select 1 from public.content_reviews r join public.content_versions v
                 on v.organization_id=r.organization_id and v.id=r.version_id
                where v.organization_id=v_org and v.opportunity_id=v_opportunity and v.version_number=4) then
    raise exception 'New draft incorrectly inherited review';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' limit 1
),true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.content_reviews where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001') then
    raise exception 'Cross-tenant review leaked';
  end if;
  begin
    perform public.review_content_draft('93a88055-0a0b-40c0-b22f-a6d312320001',
      '00000000-0000-0000-0000-000000000000','approved','Cross tenant');
    raise exception 'Cross-tenant review accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_content_draft('93a88055-0a0b-40c0-b22f-a6d312320002',
      '00000000-0000-0000-0000-000000000000','approved','Viewer');
    raise exception 'Viewer review accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: latest-only owner review, immutable history, audit, viewer and tenant denial; rolled back' as result;
