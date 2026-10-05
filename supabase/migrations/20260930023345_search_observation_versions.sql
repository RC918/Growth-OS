-- Immutable, caller-supplied observations in isolated Growth OS Staging.
create function private.observation_keys(value jsonb, expected text[])
returns boolean language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(value)='object' and
    (select array_agg(k order by k) from jsonb_object_keys(value) k)=expected;
$$;
create function private.observation_path(value text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare bytes bytea := ''::bytea; decoded text; i integer := 1; ch text;
begin
  if value is null or length(value)>300 or left(value,1)<>'/' then return false; end if;
  while i<=length(value) loop
    ch:=substr(value,i,1);
    if ch='%' then
      if substr(value,i+1,2) !~ '^[0-9A-Fa-f]{2}$' then return false; end if;
      bytes:=bytes || decode(substr(value,i+1,2),'hex'); i:=i+3;
    else bytes:=bytes || convert_to(ch,'UTF8'); i:=i+1;
    end if;
  end loop;
  decoded:=convert_from(bytes,'UTF8');
  return left(decoded,2)<>'//' and decoded !~ '[[:space:][:cntrl:]\\?#]'
    and decoded !~ '(^|/)[.]{1,2}(/|$)';
exception when others then return false;
end $$;
create function private.valid_search_observation(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; meta jsonb; row_data jsonb; action jsonb; start_day date; end_day date;
  seen text[]; clicks numeric; impressions numeric; sum_clicks numeric; sum_impressions numeric;
begin
  if payload is null or octet_length(payload::text)>1000000
     or not private.observation_keys(payload,array['a','actions','b','format','version'])
     or payload->>'format'<>'growth-os-search-baseline' or payload->'version'<>'2'::jsonb
     or jsonb_typeof(payload->'actions')<>'array' or jsonb_array_length(payload->'actions')>20 then return false; end if;
  for item in select value from jsonb_array_elements(jsonb_build_array(payload->'a',payload->'b')) loop
    if item='null'::jsonb then continue; end if;
    if not private.observation_keys(item,array['meta','rows','sample']) or jsonb_typeof(item->'sample')<>'boolean'
       or jsonb_typeof(item->'rows')<>'array' or jsonb_array_length(item->'rows') not between 1 and 366 then return false; end if;
    meta:=item->'meta';
    if not private.observation_keys(meta,array['end','exported','origin','start','type'])
       or exists(select 1 from jsonb_each(meta) where jsonb_typeof(value)<>'string')
       or meta->>'origin' !~ '^https://[A-Za-z0-9.-]+$' or meta->>'type' not in ('web','image','video','news')
       or meta->>'start' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or meta->>'end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or meta->>'exported' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
    start_day:=(meta->>'start')::date; end_day:=(meta->>'end')::date;
    perform (meta->>'exported')::timestamptz;
    if end_day-start_day not between 0 and 365 then return false; end if;
    seen:=array[]::text[]; sum_clicks:=0; sum_impressions:=0;
    for row_data in select value from jsonb_array_elements(item->'rows') loop
      if not private.observation_keys(row_data,array['clicks','date','impressions'])
         or jsonb_typeof(row_data->'date')<>'string' or row_data->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or (row_data->>'date')::date not between start_day and end_day
         or row_data->>'date'=any(seen)
         or jsonb_typeof(row_data->'clicks')<>'number' or jsonb_typeof(row_data->'impressions')<>'number' then return false; end if;
      clicks:=(row_data->>'clicks')::numeric; impressions:=(row_data->>'impressions')::numeric;
      if clicks<0 or impressions<0 or clicks<>trunc(clicks) or impressions<>trunc(impressions)
         or (impressions=0 and clicks>0) then return false; end if;
      sum_clicks:=sum_clicks+clicks; sum_impressions:=sum_impressions+impressions;
      if sum_clicks>9007199254740991 or sum_impressions>9007199254740991 then return false; end if;
      seen:=array_append(seen,row_data->>'date');
    end loop;
  end loop;
  if payload->'a'='null'::jsonb then return false; end if;
  for action in select value from jsonb_array_elements(payload->'actions') loop
    if not private.observation_keys(action,array['date','note','path'])
       or exists(select 1 from jsonb_each(action) where jsonb_typeof(value)<>'string')
       or action->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or not private.observation_path(action->>'path')
       or length(btrim(action->>'note')) not between 1 and 240 or action->>'note' ~ '[[:cntrl:]]' then return false; end if;
    perform (action->>'date')::date;
  end loop;
  if (select count(*) from jsonb_array_elements(payload->'actions'))<>
     (select count(distinct value) from jsonb_array_elements(payload->'actions')) then return false; end if;
  return true;
exception when others then return false;
end $$;
create table public.search_observation_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  payload jsonb not null check(private.valid_search_observation(payload)),
  created_at timestamptz not null default now(),
  unique(organization_id,request_id)
);
create index search_observation_versions_org_time_idx on public.search_observation_versions(organization_id,created_at desc,id desc);
alter table public.search_observation_versions enable row level security;
create policy observation_read_members on public.search_observation_versions for select to authenticated
  using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
revoke all on public.search_observation_versions from public,anon,authenticated;
grant select on public.search_observation_versions to authenticated;
create function private.save_search_observation_impl(p_organization_id uuid,p_request_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); result_id uuid; existing jsonb;
begin
  if actor is null or not private.has_org_role(p_organization_id,array['owner']::text[]) then
    raise exception 'Not authorized to save observations' using errcode='42501'; end if;
  if p_request_id is null or not private.valid_search_observation(p_payload) then
    raise exception 'Invalid observation snapshot' using errcode='22023'; end if;
  -- Serialize retries for the organization; no client-chosen revision number.
  perform 1 from public.organizations where id=p_organization_id for update;
  select id,payload into result_id,existing from public.search_observation_versions
    where organization_id=p_organization_id and request_id=p_request_id;
  if found then
    if existing is distinct from p_payload then raise exception 'Retry payload differs' using errcode='22023'; end if;
    return result_id;
  end if;
  insert into public.search_observation_versions(organization_id,request_id,actor_user_id,payload)
    values(p_organization_id,p_request_id,actor,p_payload) returning id into result_id;
  insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
    values(p_organization_id,actor,'search_observation_saved','search_observation_version',result_id,
      jsonb_build_object('request_id',p_request_id,'provenance','caller_supplied_unverified'));
  return result_id;
end $$;
create function public.save_search_observation(p_organization_id uuid,p_request_id uuid,p_payload jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.save_search_observation_impl($1,$2,$3);
$$;
revoke all on function private.observation_keys(jsonb,text[]),private.observation_path(text),private.valid_search_observation(jsonb) from public,anon;
revoke all on function private.save_search_observation_impl(uuid,uuid,jsonb),public.save_search_observation(uuid,uuid,jsonb) from public,anon;
grant execute on function private.observation_keys(jsonb,text[]),private.observation_path(text),private.valid_search_observation(jsonb) to authenticated;
grant execute on function private.save_search_observation_impl(uuid,uuid,jsonb),public.save_search_observation(uuid,uuid,jsonb) to authenticated;
