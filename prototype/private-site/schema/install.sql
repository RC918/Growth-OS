-- NEW empty-project candidate only. No role/Auth/default-ACL/extension changes.
-- Execute the complete file in one transaction. Never reuse historical RC schema.
begin;
set local search_path=public,pg_catalog;
do $preflight$
begin
 if current_user <> 'postgres' then raise exception 'Expected approved postgres creator'; end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then raise exception 'Native Auth prerequisite missing'; end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','f','v','m','S'))
  or exists(select 1 from pg_namespace where nspname='private') then raise exception 'New empty business schema required; stop, do not reset'; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('save_url_result_draft','review_url_result')) then raise exception 'RPC already exists'; end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and d.defaclnamespace in (0,'public'::regnamespace)
   and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'Future table defaults must already be closed; separate correction approval required'; end if;
end $preflight$;

create schema private;
revoke all on schema private from public,anon,authenticated,service_role;
grant usage on schema private,public to authenticated;
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_model text not null check (business_model in ('ecommerce','trade')),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  primary key (organization_id, user_id)
);
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  origin text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, origin)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  object_type text not null,
  object_id uuid,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  audience_summary text not null check (length(btrim(audience_summary)) between 1 and 1000),
  offering_summary text not null check (length(btrim(offering_summary)) between 1 and 1000),
  primary_outcome text not null check (primary_outcome in ('order','qualified_lead','booking','subscription')),
  target_market text not null check (length(btrim(target_market)) between 1 and 160),
  review_status text not null default 'draft' check (review_status in ('draft','owner_approved')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id),
  check ((review_status = 'draft' and reviewed_by is null and reviewed_at is null)
      or (review_status = 'owner_approved' and reviewed_by is not null and reviewed_at is not null))
);
create table public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  channel text not null check (channel in ('organic_search','ai_discovery','owned_content','distribution')),
  audience_need text not null check (length(btrim(audience_need)) between 1 and 500),
  proposed_action text not null check (length(btrim(proposed_action)) between 1 and 1000),
  rationale text not null check (length(btrim(rationale)) between 1 and 1000),
  status text not null default 'candidate' check (status in ('candidate','in_review','approved','rejected','published','measured')),
  evidence_confidence text not null default 'low' check (evidence_confidence in ('low','medium','high')),
  impact_score smallint check (impact_score between 1 and 5),
  effort_score smallint check (effort_score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id)
);
create table public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  source_kind text not null check (source_kind in ('owner_question','product_catalog','public_page','gsc_query','research_note')),
  source_url text,
  evidence_note text not null check (length(btrim(evidence_note)) between 1 and 1000),
  observed_at timestamptz not null,
  captured_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.growth_opportunities(organization_id, id) on delete cascade,
  check (source_url is null or (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 2048))
);
create table public.opportunity_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  decided_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.growth_opportunities(organization_id, id) on delete cascade
);
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 1 and 160),
  draft_body text not null check (length(btrim(draft_body)) between 1 and 10000),
  status text not null default 'draft' check (status = 'draft'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, opportunity_id, version_number),
  foreign key (organization_id, opportunity_id)
    references public.growth_opportunities(organization_id, id) on delete cascade
);
create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  reviewed_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, version_id),
  foreign key (organization_id, version_id)
    references public.content_versions(organization_id, id) on delete cascade
);
create table public.content_action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  proposed_path text not null check (proposed_path ~ '^/[a-z0-9][a-z0-9/_-]{0,199}$'),
  success_signal text not null check (length(btrim(success_signal)) between 1 and 1000),
  rollback_plan text not null check (length(btrim(rollback_plan)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, version_id),
  foreign key (organization_id, version_id)
    references public.content_versions(organization_id, id) on delete cascade
);
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
create table public.growth_goals (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,id)
);
create table public.growth_goal_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  goal_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  request_id uuid not null,
  version_number integer not null check(version_number between 1 and 200),
  question_key text not null check(question_key in ('goal','offering','audience','market','channel','asset','metric','confirm')),
  question_text text not null,
  answer_text text not null check(length(btrim(answer_text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique(organization_id,request_id),
  unique(goal_id,version_number),
  foreign key(organization_id,goal_id) references public.growth_goals(organization_id,id) on delete cascade
);
create index audit_owner_time_idx on audit_events(organization_id, occurred_at desc);
create index growth_opportunities_queue_idx on public.growth_opportunities(organization_id, status, created_at desc);
create index opportunity_sources_parent_idx on public.opportunity_sources(organization_id, opportunity_id);
create index opportunity_decisions_parent_idx on public.opportunity_decisions(organization_id, opportunity_id, decided_at desc);
create index content_versions_parent_idx on public.content_versions
  (organization_id, opportunity_id, version_number desc);
create index content_reviews_version_idx on public.content_reviews (organization_id, version_id);
create index content_action_plans_version_idx on public.content_action_plans (organization_id, version_id);
create index search_observation_versions_org_time_idx on public.search_observation_versions(organization_id,created_at desc,id desc);
create index growth_goals_org_time_idx on public.growth_goals(organization_id,created_at desc,id desc);
create index growth_goal_turns_org_goal_idx on public.growth_goal_turns(organization_id,goal_id,version_number);
create or replace function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.has_org_role(uuid, text[]) from public, anon;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

create policy organizations_read_members on public.organizations
  for select to authenticated
  using (private.has_org_role(id, array['owner','editor','viewer']::text[]));
create policy members_read_workspace on public.organization_members
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy sites_read_workspace on public.sites
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy audit_read_owner on public.audit_events
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner']::text[]));
create policy business_profiles_read_members on public.business_profiles for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy growth_opportunities_read_members on public.growth_opportunities for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy opportunity_sources_read_members on public.opportunity_sources for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy opportunity_decisions_read_members on public.opportunity_decisions for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy content_versions_read_members on public.content_versions for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy content_reviews_read_members on public.content_reviews for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy content_action_plans_read_members on public.content_action_plans for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy observation_read_members on public.search_observation_versions for select to authenticated
  using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
create policy goals_read_members on public.growth_goals for select to authenticated
 using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
create policy goal_turns_read_members on public.growth_goal_turns for select to authenticated
 using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
create function private.fr_require(ok boolean, code text) returns void
language plpgsql immutable set search_path='' as $$
begin if ok is distinct from true then raise exception '%',code using errcode='22023'; end if; end $$;
create function private.fr_keys(v jsonb, keys text[]) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='object' then
 (select array_agg(k order by k) from jsonb_object_keys(v) k) = (select array_agg(k order by k) from unnest(keys) k)
 else false end $$;
create function private.fr_text(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and length(btrim(v#>>'{}',
 E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0,false) $$;
create function private.fr_strings(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare x jsonb;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then return false; end if;
 for x in select value from jsonb_array_elements(v) loop if not private.fr_text(x) then return false; end if; end loop;
 return true;
end $$;
create function private.fr_utf16_length(t text) returns integer
language sql immutable strict set search_path='' as $$
 select coalesce(sum(case when ascii(substr(t,i,1))>65535 then 2 else 1 end),0)::integer from generate_series(1,length(t)) i $$;
create function private.fr_url(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare raw text:=v#>>'{}'; rest text; authority text; host text; port text:=''; tail text; close_at integer;
 i integer; j integer; cp integer; bytes bytea:=''::bytea; parts text[]; part text; base integer; digit integer; num numeric;
 spaces text:=E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
begin
 if jsonb_typeof(v) is distinct from 'string' or private.fr_utf16_length(raw)>2048 or translate(raw,spaces,'')<>raw or strpos(raw,chr(92))>0 or raw !~* '^https:' then return false; end if;
 -- HTTPS special-scheme parsing also accepts https:host / https:/host. Empty
 -- query/fragment markers have empty URL.search/hash in the accepted JS parser.
 rest:=regexp_replace(substr(raw,7),'^/+','');
 if strpos(rest,'#')>0 then if strpos(rest,'#')<>length(rest) then return false; end if; rest:=left(rest,-1); end if;
 if strpos(rest,'?')>0 then if strpos(rest,'?')<>length(rest) then return false; end if; rest:=left(rest,-1); end if;
 authority:=split_part(rest,'/',1);
 if strpos(authority,'@')>0 then
  if split_part(authority,'@',1) not in ('',':') then return false; end if;
  authority:=substr(authority,strpos(authority,'@')+1);
  if strpos(authority,'@')>0 then return false; end if;
 end if;
 if left(authority,1)='[' then
  close_at:=strpos(authority,']'); if close_at=0 then return false; end if;
  host:=substr(authority,2,close_at-2); tail:=substr(authority,close_at+1);
  if tail<>'' and left(tail,1)<>':' then return false; end if;
  port:=substr(tail,2);
  if host='' or family(host::inet)<>6 or masklen(host::inet)<>128 then return false; end if;
 else
  close_at:=strpos(authority,':');
  if close_at>0 then host:=left(authority,close_at-1); port:=substr(authority,close_at+1); else host:=authority; end if;
 end if;
 if port<>'' then
  if port !~ '^[0-9]+$' then return false; end if;
  if port::numeric>65535 then return false; end if;
 end if;
 if left(authority,1)='[' then return true; end if;
 -- Decode domain escapes before checking forbidden host characters / numeric
 -- hosts, without changing the stored URL or making any DNS/network request.
 i:=1;
 while i<=length(host) loop
  if substr(host,i,1)='%' then
   if substr(host,i+1,2) !~ '^[0-9a-fA-F]{2}$' then return false; end if;
   bytes:=bytes||decode(substr(host,i+1,2),'hex'); i:=i+3;
  else bytes:=bytes||convert_to(substr(host,i,1),'UTF8'); i:=i+1; end if;
 end loop;
 host:=convert_from(bytes,'UTF8');
 if host='' or translate(host,spaces,'')<>host then return false; end if;
 for i in 1..length(host) loop
  cp:=ascii(substr(host,i,1));
  if cp<=32 or cp=127 or strpos('/:#?@[]\^|<>%',substr(host,i,1))>0 then return false; end if;
 end loop;
 parts:=string_to_array(lower(case when right(host,1)='.' then left(host,-1) else host end),'.');
 part:=parts[array_length(parts,1)];
 -- WHATWG numeric hosts: include shortened / hex / octal IPv4 forms, but reject
 -- malformed or overflowing numeric hosts instead of treating them as DNS names.
 if part ~ '^[0-9]+$' or part ~ '^0x[0-9a-f]*$' then
  if array_length(parts,1)>4 then return false; end if;
  for i in 1..array_length(parts,1) loop
   part:=parts[i]; if part='' then return false; end if; base:=10;
   if left(part,2)='0x' then base:=16;part:=substr(part,3);
   elsif length(part)>1 and left(part,1)='0' then base:=8;part:=substr(part,2); end if;
   num:=0;
   for j in 1..length(part) loop
    digit:=strpos('0123456789abcdef',substr(part,j,1))-1;
    if digit<0 or digit>=base then return false; end if;
    num:=num*base+digit;if num>4294967295 then return false; end if;
   end loop;
   if i<array_length(parts,1) and num>255 then return false; end if;
  end loop;
  if num>=power(256::numeric,5-array_length(parts,1)) then return false; end if;
 end if;
 return true;
exception when invalid_text_representation or character_not_in_repertoire or numeric_value_out_of_range then return false;
end $$;

-- WHATWG-style replacement decoding, preserving BOM. PostgreSQL text cannot
-- represent NUL: reject rather than silently changing bytes/HTML or JSON strings.
create function private.fr_decode_utf8(b bytea) returns text
language plpgsql immutable strict set search_path='' as $$
declare i integer:=0; n integer:=octet_length(b); lead integer; cp integer; need integer;
 j integer; x integer; lo integer; hi integer; valid boolean; result text:=''; chunk text:='';
begin
 -- Valid UTF-8 is the common path; avoid a byte-by-byte SQL loop.
 begin return convert_from(b,'UTF8'); exception when character_not_in_repertoire then null; end;
 while i<n loop
  if length(chunk)>=4096 then result:=result||chunk; chunk:=''; end if;
  lead:=get_byte(b,i); i:=i+1;
  if lead<128 then
   perform private.fr_require(lead<>0,'SOURCE_NUL_UNREPRESENTABLE'); chunk:=chunk||chr(lead); continue;
  elsif lead between 194 and 223 then cp:=lead-192; need:=1;
  elsif lead between 224 and 239 then cp:=lead-224; need:=2;
  elsif lead between 240 and 244 then cp:=lead-240; need:=3;
  else chunk:=chunk||chr(65533); continue; end if;
  valid:=true;
  for j in 1..need loop
   lo:=128; hi:=191;
   if j=1 then
    if lead=224 then lo:=160; elsif lead=237 then hi:=159;
    elsif lead=240 then lo:=144; elsif lead=244 then hi:=143; end if;
   end if;
   if i>=n then valid:=false; exit; end if;
   x:=get_byte(b,i);
   if x<lo or x>hi then valid:=false; exit; end if;
   i:=i+1; cp:=cp*64+x-128;
  end loop;
  chunk:=chunk||chr(case when valid then cp else 65533 end);
 end loop;
 return result||chunk;
end $$;

create function private.fr_content_digest(p jsonb) returns text
language plpgsql immutable strict set search_path='' as $$
declare r jsonb:=p->'review'; f jsonb:=p#>'{preview,fields}'; canonical text;
begin
 -- JSON string escaping is applied to individual strings; never strip spaces
 -- from a serialized JSON object. These keys match the accepted JS Review order.
 canonical:='{"schema_version":1,"original_url":'||(r->'original_url')::text||
 ',"final_url":'||(r->'final_url')::text||',"snapshot_id":'||(r->'snapshot_id')::text||
 ',"source_version":'||(r->'source_version')::text||',"revision":'||(r->'revision')::text||
 ',"fields":{"title":'||(f#>'{title,suggested}')::text||',"meta_description":'||(f#>'{meta_description,suggested}')::text||
 ',"description":'||(f#>'{description,suggested}')::text||'}}';
 return 'sha256:'||encode(sha256(convert_to(canonical,'UTF8')),'hex');
end $$;
create function private.fr_refs(refs jsonb, ids jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare x jsonb;
begin
 perform private.fr_require(private.fr_strings(refs),'INVALID_REFERENCES');
 for x in select value from jsonb_array_elements(refs) loop
  perform private.fr_require(ids ? (x#>>'{}'),'UNKNOWN_REFERENCE');
 end loop;
end $$;
create function private.fr_fact(v jsonb, ids jsonb, product jsonb, scoped boolean) returns void
language plpgsql immutable set search_path='' as $$
declare scope jsonb:=v->'product_scope'; x jsonb;
begin
 perform private.fr_require(private.fr_keys(v,array['kind','verification','value','citations']||case when scoped then array['product_scope'] else array[]::text[] end)
 and v->>'kind'='fact' and v->>'verification'='source_asserted' and private.fr_text(v->'value'),'INVALID_FACT');
 perform private.fr_refs(v->'citations',ids);
 if scoped then
  perform private.fr_require(private.fr_keys(scope,array['locator','name_locator','product_name']) and private.fr_text(scope->'locator') and private.fr_text(scope->'name_locator')
  and scope->'product_name'=product->'value','INVALID_PRODUCT_SCOPE');
  for x in select value from jsonb_array_elements(product->'citations') loop
   perform private.fr_require(v->'citations' @> jsonb_build_array(x),'MISSING_NAME_REFERENCE');
  end loop;
 end if;
end $$;

-- Match the bounded JSON walk: each child has a key/index visit and value visit.
create function private.fr_json_bounds(p jsonb) returns boolean
language sql immutable strict set search_path='' as $$
 with recursive walk(value,depth) as (
  select p,0
  union all
  select child.value,w.depth+1 from walk w cross join lateral (
   select value from jsonb_each(case when jsonb_typeof(w.value)='object' then w.value else '{}'::jsonb end)
   union all
   select value from jsonb_array_elements(case when jsonb_typeof(w.value)='array' then w.value else '[]'::jsonb end)
  ) child where w.depth<25
 ) select max(depth)<=24 and 2*count(*)-1<=100000 from (select * from walk limit 50001) bounded $$;

create function private.fr_valid_payload(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb:=p->'snapshot'; v jsonb:=p->'review'; preview jsonb:=p->'preview'; facts jsonb:=p->'facts';
 ids jsonb:='{}'; x jsonb; f jsonb; c jsonb; k text; missing jsonb:='[]'; bytes bytea; source_hash text; content_hash text; edited boolean;
 fields text[]:=array['title','meta_description','description'];
begin
 if p is null then return false; end if;
 perform private.fr_require(jsonb_typeof(p)='object' and octet_length(convert_to(p::text,'UTF8'))<=8388608
 and private.fr_json_bounds(p) and not (p ?| array['organization_id','opportunity_id','request_id','expected_version','fixture_context']),'INVALID_PAYLOAD');
 perform private.fr_require(s->'schema_version'='1'::jsonb and jsonb_typeof(s->'id')='string' and s->>'id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 and jsonb_typeof(s->'version')='string' and s->>'version' ~ '^[0-9a-f]{64}$','INVALID_SNAPSHOT');
 perform private.fr_require(private.fr_url(s->'original_url') and private.fr_url(s->'final_url'),'INVALID_URL');
 perform private.fr_require(private.fr_text(s->'fetched_at') and s->>'fetched_at' ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$','INVALID_FETCH_TIME');
 perform (s->>'fetched_at')::timestamptz;
 perform private.fr_require(jsonb_typeof(s->'content_base64')='string' and length(s->>'content_base64')<=1398104
 and s->>'content_base64' ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$','INVALID_SOURCE_BYTES');
 bytes:=decode(s->>'content_base64','base64');
 perform private.fr_require(octet_length(bytes) between 1 and 1048576 and replace(encode(bytes,'base64'),E'\n','')=s->>'content_base64','INVALID_SOURCE_BYTES');
 source_hash:='sha256:'||encode(sha256(bytes),'hex');
 perform private.fr_require(source_hash=s->>'content_fingerprint' and source_hash='sha256:'||(s->>'version'),'SOURCE_HASH_MISMATCH');
 perform private.fr_require(s->>'encoding'='utf-8-with-replacement' and jsonb_typeof(s->'html')='string' and s->>'html'=private.fr_decode_utf8(bytes),'SOURCE_TEXT_MISMATCH');
 perform private.fr_require(preview->'source_snapshot_id'=s->'id' and preview->'source_version'=s->'version' and preview->'published'='false'::jsonb,'INVALID_PREVIEW_BINDING');
 perform private.fr_require(v->'schema_version'='1'::jsonb and v->>'scope'='page_only' and v->'persisted'='false'::jsonb
 and v->'snapshot_id'=s->'id' and v->'source_version'=s->'version' and v->'original_url'=s->'original_url' and v->'final_url'=s->'final_url'
 and jsonb_typeof(v->'revision')='number' and v->>'revision' ~ '^(0|[1-9][0-9]*)$','INVALID_REVIEW_BINDING');
 perform private.fr_require((v->>'revision')::numeric<=9007199254740991,'INVALID_REVISION');
 perform private.fr_require(private.fr_keys(preview->'fields',fields) and private.fr_keys(v->'original_suggestions',fields)
 and private.fr_keys(v->'edited',fields) and private.fr_keys(v->'fact_checks',fields),'INVALID_FIELDS');
 perform private.fr_require(jsonb_typeof(s->'citations')='array' and jsonb_array_length(s->'citations')>0,'INVALID_CITATIONS');
 for c in select value from jsonb_array_elements(s->'citations') loop
  perform private.fr_require(private.fr_text(c->'id') and not (ids ? (c->>'id')) and c->'snapshot_id'=s->'id' and c->'source_version'=s->'version'
  and c->'url'=s->'final_url' and private.fr_text(c->'locator') and private.fr_text(c->'quote'),'INVALID_CITATION');
  ids:=ids||jsonb_build_object(c->>'id',true);
 end loop;
 perform private.fr_require(p->>'page_type'='product' and p#>>'{extraction,method}' in ('explicit_product_microdata','woocommerce_single_product')
 and private.fr_strings(p#>'{extraction,limitations}') and private.fr_strings(s->'limitations') and preview->>'generation'='extractive_rules','INVALID_EVIDENCE_SCHEMA');
 perform private.fr_require(private.fr_keys(facts,array['product_name','title','meta_description','description','features','use']),'INVALID_FACTS');
 perform private.fr_fact(facts->'product_name',ids,null,false);
 perform private.fr_fact(facts->'description',ids,facts->'product_name',true);
 foreach k in array array['title','meta_description','use'] loop
  if facts->k='null'::jsonb then missing:=missing||jsonb_build_array(k); else perform private.fr_fact(facts->k,ids,null,false); end if;
 end loop;
 perform private.fr_require(jsonb_typeof(facts->'features')='array','INVALID_FEATURES');
 for x in select value from jsonb_array_elements(facts->'features') loop perform private.fr_fact(x,ids,facts->'product_name',true); end loop;
 if jsonb_array_length(facts->'features')=0 then missing:=missing||jsonb_build_array('features'); end if;
 missing:=missing||'["specifications","price","certifications","performance","comparisons","guarantees"]'::jsonb;
 perform private.fr_require(p->'missing'=missing and private.fr_strings(preview->'pending_confirmation')
 and ((preview->'pending_confirmation') - 0)=missing,'INVALID_UNKNOWNS');
 perform private.fr_require(jsonb_typeof(p->'inferences')='array' and jsonb_array_length(p->'inferences')>0,'INVALID_INFERENCES');
 for x in select value from jsonb_array_elements(p->'inferences') loop
  perform private.fr_require(private.fr_keys(x,array['kind','value','basis','citations']) and x->>'kind'='inference' and private.fr_text(x->'value') and private.fr_text(x->'basis'),'INVALID_INFERENCE');
  perform private.fr_refs(x->'citations',ids);
 end loop;
 foreach k in array fields loop
  f:=preview->'fields'->k;
  perform private.fr_require(private.fr_text(f->'suggested') and private.fr_utf16_length(f->>'suggested')<=2000 and jsonb_typeof(f->'original')='string'
  and private.fr_text(v->'original_suggestions'->k) and private.fr_text(f->'reason'),'INVALID_FIELD');
  perform private.fr_refs(f->'citations',ids);
  perform private.fr_require(f->>'original'=coalesce(facts->k->>'value',''),'ORIGINAL_FACT_MISMATCH');
  edited:=(f->'suggested'<>v->'original_suggestions'->k);
  perform private.fr_require(v->'edited'->k=to_jsonb(edited) and f->'user_edited'=to_jsonb(edited)
  and f->>'citation_role'=case when edited then 'reference_only_for_user_edit' else 'source_support' end and jsonb_typeof(v->'fact_checks'->k)='boolean','INVALID_EDIT_ATTRIBUTION');
 end loop;
 content_hash:=private.fr_content_digest(p);
 perform private.fr_require(v->>'content_digest'=content_hash,'CONTENT_DIGEST_MISMATCH');
 c:=v->'confirmation';
 if c is distinct from 'null'::jsonb then
  perform private.fr_require(private.fr_keys(c,array['scope','original_url','final_url','snapshot_id','source_version','revision','content_digest','fact_checks'])
  and c->>'scope'='page_only' and c->>'content_digest'=content_hash and private.fr_keys(c->'fact_checks',fields),'INVALID_PAGE_CONFIRMATION');
  foreach k in array array['original_url','final_url','snapshot_id','source_version','revision'] loop perform private.fr_require(c->k=v->k,'STALE_PAGE_CONFIRMATION'); end loop;
  foreach k in array fields loop perform private.fr_require(c->'fact_checks'->k='true'::jsonb and v->'fact_checks'->k='true'::jsonb,'STALE_FACT_CHECKS'); end loop;
 end if;
 perform private.fr_require(preview->>'status'=case when c='null'::jsonb then 'awaiting_review' else 'locally_confirmed' end,'INVALID_REVIEW_STATUS');
 return true;
end $$;

create function private.fr_request_digest(org uuid, parent uuid, actor uuid, request uuid, expected integer, payload jsonb) returns text
language sql immutable strict set search_path='' as $$
 select 'pg-jsonb-sha256:'||encode(sha256(convert_to(jsonb_build_object('schema_version',1,'organization_id',org,'opportunity_id',parent,
 'actor_user_id',actor,'request_id',request,'expected_version',expected,'payload',payload)::text,'UTF8')),'hex') $$;

alter table public.content_versions
 add column first_result_payload jsonb,
 add column first_result_request_id uuid,
 add column first_result_expected_version integer,
 add column first_result_request_digest text,
 add constraint content_versions_first_result_request_unique unique(organization_id,first_result_request_id);
alter table public.content_versions drop constraint content_versions_title_check;
alter table public.content_versions add constraint content_versions_draft_shape check (coalesce(
 (first_result_payload is null and first_result_request_id is null and first_result_expected_version is null and first_result_request_digest is null
  and length(btrim(title)) between 1 and 160)
 or
 (first_result_payload is not null and first_result_request_id is not null and first_result_expected_version between 0 and 2147483646
  and version_number=first_result_expected_version+1 and private.fr_valid_payload(first_result_payload)
  and title=first_result_payload#>>'{preview,fields,title,suggested}' and draft_body=first_result_payload#>>'{preview,fields,description,suggested}'
  and first_result_request_digest=private.fr_request_digest(organization_id,opportunity_id,created_by,first_result_request_id,first_result_expected_version,first_result_payload)),false));

alter table public.growth_opportunities
 add column entry_kind text not null default 'legacy_opportunity',
 add column source_identity jsonb,
 alter column channel drop not null,
 alter column audience_need drop not null,
 alter column proposed_action drop not null,
 alter column rationale drop not null,
 drop constraint growth_opportunities_status_check,
 add constraint growth_opportunities_entry_shape check (coalesce(
  (entry_kind='legacy_opportunity' and source_identity is null
   and channel is not null and audience_need is not null and proposed_action is not null and rationale is not null
   and status in ('candidate','in_review','approved','rejected','published','measured'))
  or (entry_kind='url_result' and status='url_pending_review' and site_id is null
   and channel is null and audience_need is null and proposed_action is null and rationale is null
   and impact_score is null and effort_score is null and evidence_confidence='low'
   and source_identity is not null and jsonb_typeof(source_identity)='object'),false));

create function private.url_source_identity(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('original_url',p#>'{snapshot,original_url}','final_url',p#>'{snapshot,final_url}',
 'snapshot_id',p#>'{snapshot,id}','source_version',p#>'{snapshot,version}','source_digest',p#>'{snapshot,content_fingerprint}') $$;
revoke all on function private.url_source_identity(jsonb) from public,anon,authenticated,service_role;

create function private.guard_url_parent() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.entry_kind is distinct from old.entry_kind or new.organization_id is distinct from old.organization_id
  or new.id is distinct from old.id or new.source_identity is distinct from old.source_identity) then
  raise exception 'Parent identity is immutable' using errcode='23514'; end if;
 if new.entry_kind='url_result' then
  if not coalesce(private.fr_keys(new.source_identity,array['original_url','final_url','snapshot_id','source_version','source_digest'])
   and private.fr_url(new.source_identity->'original_url') and private.fr_url(new.source_identity->'final_url')
   and jsonb_typeof(new.source_identity->'snapshot_id')='string' and jsonb_typeof(new.source_identity->'source_version')='string' and jsonb_typeof(new.source_identity->'source_digest')='string'
   and new.source_identity->>'snapshot_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   and new.source_identity->>'source_version' ~ '^[0-9a-f]{64}$'
   and new.source_identity->>'source_digest'='sha256:'||(new.source_identity->>'source_version'),false)
  then raise exception 'Invalid URL source identity' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_url_parent() from public,anon,authenticated,service_role;
create trigger guard_url_parent before insert or update on public.growth_opportunities for each row execute function private.guard_url_parent();

create function private.guard_url_version() returns trigger language plpgsql set search_path='' as $$
declare parent public.growth_opportunities%rowtype;
begin
 if TG_OP='UPDATE' and (old.organization_id is distinct from new.organization_id or old.opportunity_id is distinct from new.opportunity_id) then
  raise exception 'Version parent is immutable' using errcode='23514'; end if;
 select * into parent from public.growth_opportunities where organization_id=new.organization_id and id=new.opportunity_id;
 if parent.entry_kind='url_result' and (new.first_result_payload is null or
  private.url_source_identity(new.first_result_payload) is distinct from parent.source_identity) then
  raise exception 'URL version source binding mismatch' using errcode='23514'; end if;
 -- Existing typed CHECK performs full evidence/hash validation, including direct writes.
 return new;
end $$;
revoke all on function private.guard_url_version() from public,anon,authenticated,service_role;
create trigger guard_url_version before insert or update on public.content_versions for each row execute function private.guard_url_version();

create function private.save_url_result_draft_impl(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old public.content_versions%rowtype; parent public.growth_opportunities%rowtype;
 latest integer; result_id uuid; fingerprint text; created_parent boolean:=false;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_opportunity_id is not null and p_request_id is not null and p_expected_version between 0 and 2147483646 and p_payload is not null,'INVALID_REQUEST');
 perform 1 from public.organizations where id=p_organization_id for no key update;
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);
 select * into old from public.content_versions where organization_id=p_organization_id and first_result_request_id=p_request_id;
 if found then
  if old.created_by<>actor or old.opportunity_id<>p_opportunity_id or old.first_result_expected_version<>p_expected_version
   or old.first_result_payload is distinct from p_payload or old.first_result_request_digest<>fingerprint
   or not exists(select 1 from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id and entry_kind='url_result') then
   raise exception 'Request ID payload differs' using errcode='22023'; end if;
  return old.id;
 end if;
 perform private.fr_require(private.fr_valid_payload(p_payload),'INVALID_PAYLOAD');
 select * into parent from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id for update;
 if not found then
  if p_expected_version<>0 then raise exception 'URL parent missing' using errcode='PT409'; end if;
  -- Primary key also rejects a foreign-org UUID collision without reparenting.
  insert into public.growth_opportunities(id,organization_id,entry_kind,status,source_identity)
   values(p_opportunity_id,p_organization_id,'url_result','url_pending_review',private.url_source_identity(p_payload));
  created_parent:=true;
 else
  if parent.entry_kind<>'url_result' or parent.status<>'url_pending_review' or parent.source_identity is distinct from private.url_source_identity(p_payload) then
   raise exception 'URL parent/source mismatch' using errcode='23514'; end if;
  if p_expected_version=0 then raise exception 'URL parent already exists' using errcode='PT409'; end if;
 end if;
 select coalesce(max(version_number),0) into latest from public.content_versions where organization_id=p_organization_id and opportunity_id=p_opportunity_id;
 if latest<>p_expected_version then raise exception 'Content version changed; read back first' using errcode='PT409'; end if;
 insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,
 first_result_payload,first_result_request_id,first_result_expected_version,first_result_request_digest)
 values(p_organization_id,p_opportunity_id,latest+1,p_payload#>>'{preview,fields,title,suggested}',p_payload#>>'{preview,fields,description,suggested}',actor,
 p_payload,p_request_id,p_expected_version,fingerprint) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'url_result_draft_saved','content_version',result_id,jsonb_build_object('request_id',p_request_id,'version_number',latest+1,
 'opportunity_id',p_opportunity_id,'created_parent',created_parent,'source_digest',p_payload#>>'{snapshot,content_fingerprint}',
 'content_digest',private.fr_content_digest(p_payload),'request_digest',fingerprint,'provenance','caller_supplied_unverified','approval','none'));
 return result_id;
end $$;
create function public.save_url_result_draft(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.save_url_result_draft_impl($1,$2,$3,$4,$5) $$;
revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
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

alter table public.organizations enable row level security;
revoke all on table public.organizations from public,anon,authenticated,service_role;
grant select on table public.organizations to authenticated;

alter table public.organization_members enable row level security;
revoke all on table public.organization_members from public,anon,authenticated,service_role;
grant select on table public.organization_members to authenticated;

alter table public.sites enable row level security;
revoke all on table public.sites from public,anon,authenticated,service_role;
grant select on table public.sites to authenticated;

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from public,anon,authenticated,service_role;
grant select on table public.audit_events to authenticated;

alter table public.business_profiles enable row level security;
revoke all on table public.business_profiles from public,anon,authenticated,service_role;
grant select on table public.business_profiles to authenticated;

alter table public.growth_opportunities enable row level security;
revoke all on table public.growth_opportunities from public,anon,authenticated,service_role;
grant select on table public.growth_opportunities to authenticated;

alter table public.opportunity_sources enable row level security;
revoke all on table public.opportunity_sources from public,anon,authenticated,service_role;
grant select on table public.opportunity_sources to authenticated;

alter table public.opportunity_decisions enable row level security;
revoke all on table public.opportunity_decisions from public,anon,authenticated,service_role;
grant select on table public.opportunity_decisions to authenticated;

alter table public.content_versions enable row level security;
revoke all on table public.content_versions from public,anon,authenticated,service_role;
grant select on table public.content_versions to authenticated;

alter table public.content_reviews enable row level security;
revoke all on table public.content_reviews from public,anon,authenticated,service_role;
grant select on table public.content_reviews to authenticated;

alter table public.content_action_plans enable row level security;
revoke all on table public.content_action_plans from public,anon,authenticated,service_role;
grant select on table public.content_action_plans to authenticated;

alter table public.search_observation_versions enable row level security;
revoke all on table public.search_observation_versions from public,anon,authenticated,service_role;
grant select on table public.search_observation_versions to authenticated;

alter table public.growth_goals enable row level security;
revoke all on table public.growth_goals from public,anon,authenticated,service_role;
grant select on table public.growth_goals to authenticated;

alter table public.growth_goal_turns enable row level security;
revoke all on table public.growth_goal_turns from public,anon,authenticated,service_role;
grant select on table public.growth_goal_turns to authenticated;
revoke all on function private.observation_keys(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function private.observation_path(text) from public,anon,authenticated,service_role;
revoke all on function private.valid_search_observation(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.has_org_role(uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function private.fr_require(boolean,text) from public,anon,authenticated,service_role;
revoke all on function private.fr_keys(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function private.fr_text(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_strings(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_utf16_length(text) from public,anon,authenticated,service_role;
revoke all on function private.fr_url(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_decode_utf8(bytea) from public,anon,authenticated,service_role;
revoke all on function private.fr_content_digest(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_refs(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_fact(jsonb,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function private.fr_json_bounds(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_valid_payload(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fr_request_digest(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.url_source_identity(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.guard_url_parent() from public,anon,authenticated,service_role;
revoke all on function private.guard_url_version() from public,anon,authenticated,service_role;
revoke all on function private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;
commit;
NOTIFY pgrst, 'reload schema';
