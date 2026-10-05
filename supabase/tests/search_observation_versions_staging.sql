-- Run inside a transaction; caller must roll back the synthetic writes.
do $$ begin
  if has_table_privilege('authenticated','public.search_observation_versions','INSERT')
     or has_table_privilege('authenticated','public.search_observation_versions','UPDATE')
     or has_table_privilege('authenticated','public.search_observation_versions','DELETE')
     or has_function_privilege('anon','public.save_search_observation(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'Observation grants incorrect'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and role='owner' order by user_id limit 1),true);
set local role authenticated;
do $$
declare org uuid:='93a88055-0a0b-40c0-b22f-a6d312320001'; request uuid:=gen_random_uuid(); id1 uuid; id2 uuid;
  payload jsonb:='{"format":"growth-os-search-baseline","version":2,"a":{"meta":{"origin":"https://shop.example","type":"web","start":"2026-09-01","end":"2026-09-03","exported":"2026-09-07T00:00:00Z"},"sample":true,"rows":[{"date":"2026-09-01","clicks":2,"impressions":10}]},"b":null,"actions":[{"date":"2026-09-04","path":"/product-comparison","note":"Synthetic update"}]}'::jsonb;
  bad jsonb;
begin
  id1:=public.save_search_observation(org,request,payload);
  if public.save_search_observation(org,request,payload)<>id1 then raise exception 'Retry duplicated revision'; end if;
  if (select count(*) from public.audit_events where object_id=id1 and event_type='search_observation_saved')<>1 then raise exception 'Audit duplicate or missing'; end if;
  id2:=public.save_search_observation(org,gen_random_uuid(),jsonb_set(payload,'{actions}', '[]'));
  if id2=id1 or (select v.payload from public.search_observation_versions v where v.id=id1)<>payload then raise exception 'Old version mutated'; end if;
  begin
    perform public.save_search_observation(org,request,jsonb_set(payload,'{actions}','[]'));
    raise exception 'Changed retry accepted';
  exception when invalid_parameter_value then null; end;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(payload,'{a,rows,0,clicks}','-1'),
    jsonb_set(payload,'{a,rows,0,clicks}','1.5'),
    jsonb_set(payload,'{a,rows,0,impressions}','0'),
    jsonb_set(payload,'{a,rows,0,date}','"2026-02-30"'),
    jsonb_set(payload,'{a,rows,0,date}','"2026-09-04"'),
    jsonb_set(payload,'{a,rows}',(payload#>'{a,rows}')||(payload#>'{a,rows}')),
    jsonb_set(payload,'{a,rows,0,clicks}','9007199254740992'),
    jsonb_set(payload,'{a,meta,origin}','"https://shop.example/private"'),
    jsonb_set(payload,'{a,meta,exported}','"2026-09-07T00:00:00"'),
    payload||'{"clicks":999}',
    jsonb_set(payload,'{actions,0,path}','"/%2e%2e/private"'),
    jsonb_set(payload,'{actions,0,path}','"/foo%"'),
    jsonb_set(payload,'{actions,0,path}','"//foreign.example"'),
    jsonb_set(payload,'{actions,0,date}','"2026-02-30"')
  )) loop
    begin
      perform public.save_search_observation(org,gen_random_uuid(),bad);
      raise exception 'Malformed payload accepted: %',bad;
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    update public.search_observation_versions v set payload=v.payload where v.id=id1;
    raise exception 'Authenticated update allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A same-tenant viewer can read saved versions but cannot create a new one.
insert into public.organization_members(organization_id,user_id,role)
  select '93a88055-0a0b-40c0-b22f-a6d312320001',user_id,'viewer' from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' order by user_id limit 1;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organization_members
  where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' order by user_id limit 1),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.search_observation_versions where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001') then raise exception 'Same tenant viewer cannot read'; end if;
  begin
    perform public.save_search_observation('93a88055-0a0b-40c0-b22f-a6d312320001',gen_random_uuid(),null);
    raise exception 'Viewer write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from public.organization_members where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001'
  and user_id=(select user_id from public.organization_members where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' order by user_id limit 1);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.search_observation_versions where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001') then raise exception 'Foreign snapshot leaked'; end if;
  begin
    perform public.save_search_observation('93a88055-0a0b-40c0-b22f-a6d312320001',gen_random_uuid(),null);
    raise exception 'Foreign write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.save_search_observation('93a88055-0a0b-40c0-b22f-a6d312320001',gen_random_uuid(),null);
    raise exception 'Anonymous write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
