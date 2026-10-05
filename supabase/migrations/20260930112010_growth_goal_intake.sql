-- M1 additive, immutable guided conversations. Not applied to remote Staging.
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
create index growth_goals_org_time_idx on public.growth_goals(organization_id,created_at desc,id desc);
create index growth_goal_turns_org_goal_idx on public.growth_goal_turns(organization_id,goal_id,version_number);
alter table public.growth_goals enable row level security;
alter table public.growth_goal_turns enable row level security;
create policy goals_read_members on public.growth_goals for select to authenticated
 using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
create policy goal_turns_read_members on public.growth_goal_turns for select to authenticated
 using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
revoke all on public.growth_goals,public.growth_goal_turns from public,anon,authenticated;
grant select on public.growth_goals,public.growth_goal_turns to authenticated;

-- Private definer is needed for an atomic append: client roles have no direct
-- writes. Authorization is checked on every call against current membership.
create function private.save_goal_turn_impl(p_organization_id uuid,p_goal_id uuid,
 p_request_id uuid,p_expected_version integer,p_question_key text,p_answer text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.growth_goal_turns; current_version integer;
 required_key text; prompt text; field text; fields text[]:=array['offering','audience','market','channel','asset','metric'];
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']::text[]) then
  raise exception 'Not authorized to save goal' using errcode='42501'; end if;
 if p_goal_id is null or p_request_id is null or p_expected_version is null
  or p_expected_version not between 0 and 199 or p_question_key is null
  or p_answer is null or length(btrim(p_answer)) not between 1 and 2000 then
  raise exception 'Invalid goal turn' using errcode='22023'; end if;
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into existing from public.growth_goal_turns where organization_id=p_organization_id and request_id=p_request_id;
 if found then
  if existing.goal_id<>p_goal_id or existing.version_number<>p_expected_version+1
   or existing.question_key<>p_question_key or existing.answer_text is distinct from p_answer then
   raise exception 'Retry differs' using errcode='22023'; end if;
  return jsonb_build_object('goal_id',p_goal_id,'version_number',existing.version_number);
 end if;
 if p_expected_version=0 then
  if p_question_key<>'goal' then raise exception 'Goal must be first' using errcode='22023'; end if;
  insert into public.growth_goals(id,organization_id,actor_user_id) values(p_goal_id,p_organization_id,actor);
  prompt:='告訴我你正在做什麼，我們一起開始。';
 else
  if not exists(select 1 from public.growth_goals where id=p_goal_id and organization_id=p_organization_id) then
   raise exception 'Goal unavailable' using errcode='42501'; end if;
  select coalesce(max(version_number),0) into current_version from public.growth_goal_turns
   where organization_id=p_organization_id and goal_id=p_goal_id;
  if current_version<>p_expected_version then raise exception 'Goal version changed; reload' using errcode='40001'; end if;
  foreach field in array fields loop
   if not exists(select 1 from public.growth_goal_turns where organization_id=p_organization_id
     and goal_id=p_goal_id and question_key=field) then required_key:=field;exit;end if;
  end loop;
  if p_question_key='confirm' then
   if required_key is not null or p_answer<>'確認' then raise exception 'Cannot confirm incomplete goal' using errcode='22023';end if;
   if (select question_key from public.growth_goal_turns where organization_id=p_organization_id and goal_id=p_goal_id
      order by version_number desc limit 1)='confirm' then raise exception 'Already confirmed' using errcode='22023';end if;
   prompt:='請確認下面資料是否符合你的目標。確認只完成資料收集，尚未建立計畫、發布或取得成長數據。';
  else
   if not (p_question_key=any(fields)) or
     (p_question_key is distinct from required_key and not exists(select 1 from public.growth_goal_turns
       where organization_id=p_organization_id and goal_id=p_goal_id and question_key=p_question_key)) then
    raise exception 'Unexpected question' using errcode='22023';end if;
   prompt:=case p_question_key
    when 'offering' then '你想推廣什麼產品、服務或作品？'
    when 'audience' then '你希望哪些人看見它？'
    when 'market' then '你優先想接觸哪個市場、使用什麼語言？'
    when 'channel' then '你想先從哪個渠道取得流量？第一版先支援網站自然搜尋；其他渠道也可以記錄。'
    when 'asset' then '有可以分享的網站或產品連結嗎？沒有也可以回答「尚無連結」。'
    when 'metric' then '你希望觀察什麼流量指標與期間？例如未來四週的搜尋點擊；不確定也可以說明。' end;
  end if;
 end if;
 insert into public.growth_goal_turns(organization_id,goal_id,actor_user_id,request_id,version_number,question_key,question_text,answer_text)
 values(p_organization_id,p_goal_id,actor,p_request_id,p_expected_version+1,p_question_key,prompt,p_answer);
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'goal_turn_saved','growth_goal',p_goal_id,
  jsonb_build_object('request_id',p_request_id,'version_number',p_expected_version+1,'question_key',p_question_key,'mode','guided_v1'));
 return jsonb_build_object('goal_id',p_goal_id,'version_number',p_expected_version+1);
end $$;
create function public.save_goal_turn(p_organization_id uuid,p_goal_id uuid,p_request_id uuid,
 p_expected_version integer,p_question_key text,p_answer text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_goal_turn_impl($1,$2,$3,$4,$5,$6);
$$;
revoke all on function private.save_goal_turn_impl(uuid,uuid,uuid,integer,text,text),
 public.save_goal_turn(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function private.save_goal_turn_impl(uuid,uuid,uuid,integer,text,text),
 public.save_goal_turn(uuid,uuid,uuid,integer,text,text) to authenticated;
