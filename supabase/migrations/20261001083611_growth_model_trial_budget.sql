-- STAGED ONLY. Remote application requires exact SQL/ACL approval. No activation.
create table private.model_trial (
 singleton boolean primary key default true check(singleton),
 actor_user_id uuid references auth.users(id),
 organization_id uuid references public.organizations(id),
 state text not null default 'staged' check(state in ('staged','active','paused','closed')),
 starts_at timestamptz, deadline timestamptz,
 policy_version text not null default 'gpt41mini-20250414-v1' check(policy_version='gpt41mini-20250414-v1'),
 calls_reserved integer not null default 0 check(calls_reserved between 0 and 100),
 spent_nusd bigint not null default 0 check(spent_nusd>=0),
 held_nusd bigint not null default 0 check(held_nusd>=0),
 active_request uuid,
 warnings integer[] not null default '{}',
 check(spent_nusd+held_nusd<=1000000000),
 check((starts_at is null and deadline is null and state='staged') or
 (starts_at is not null and deadline=starts_at+interval '7 days' and actor_user_id is not null and organization_id is not null))
);
insert into private.model_trial(singleton) values(true);
create table private.model_trial_attempts (
 request_id uuid primary key,
 actor_user_id uuid not null, organization_id uuid not null,
 fixture_id text not null check(fixture_id in ('synth-parts-v1','synth-shop-v1')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 expected_version integer not null check(expected_version=1),
 state text not null check(state in ('reserved','settled','unknown')),
 reserved_nusd bigint not null check(reserved_nusd=420668800),
 actual_nusd bigint, input_tokens integer, output_tokens integer,
 result_code text, created_at timestamptz not null default clock_timestamp(), settled_at timestamptz
);
alter table private.model_trial enable row level security;
alter table private.model_trial_attempts enable row level security;
revoke all on private.model_trial,private.model_trial_attempts from public,anon,authenticated,service_role;

create function public.model_trial_reserve(p_request uuid,p_actor uuid,p_org uuid,p_fixture text,p_hash text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.model_trial; a private.model_trial_attempts; new_warnings integer[]; begin
 select * into t from private.model_trial where singleton for update;
 if not found then raise exception 'Trial unavailable' using errcode='55000'; end if;
 if p_actor is null or p_org is null or t.actor_user_id is distinct from p_actor or t.organization_id is distinct from p_org
 or not private.has_org_role_for_model_trial(p_org,p_actor)
 then raise exception 'Trial owner required' using errcode='42501'; end if;
 if p_request is null or p_fixture not in ('synth-parts-v1','synth-shop-v1') or p_fixture is null
 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is distinct from 1
 then raise exception 'Invalid trial request' using errcode='22023'; end if;
 select * into a from private.model_trial_attempts where request_id=p_request;
 if found then
  if a.actor_user_id<>p_actor or a.organization_id<>p_org or a.fixture_id<>p_fixture or a.payload_hash<>p_hash or a.expected_version<>p_version
  then raise exception 'Retry differs' using errcode='22023'; end if;
  return jsonb_build_object('dispatch',false,'state',a.state,'calls_reserved',t.calls_reserved,'warnings',t.warnings);
 end if;
 if t.state<>'active' or t.starts_at is null or clock_timestamp()<t.starts_at or clock_timestamp()>=t.deadline-interval '2 minutes'
 then raise exception 'Trial inactive or expired' using errcode='55000'; end if;
 if t.active_request is not null then raise exception 'Trial busy; no automatic retry' using errcode='55000'; end if;
 -- A pair reserves TWO HTTP calls (count + generate), so total external calls <=100.
 if t.calls_reserved+2>100 or t.spent_nusd+t.held_nusd+420668800>1000000000
 then raise exception 'Trial quota exhausted' using errcode='54000'; end if;
 new_warnings:=t.warnings;
 if (t.calls_reserved+2>=50 or t.spent_nusd+t.held_nusd+420668800>=500000000) and not(50=any(new_warnings)) then new_warnings:=array_append(new_warnings,50); end if;
 if (t.calls_reserved+2>=80 or t.spent_nusd+t.held_nusd+420668800>=800000000) and not(80=any(new_warnings)) then new_warnings:=array_append(new_warnings,80); end if;
 insert into private.model_trial_attempts(request_id,actor_user_id,organization_id,fixture_id,payload_hash,expected_version,state,reserved_nusd)
 values(p_request,p_actor,p_org,p_fixture,p_hash,p_version,'reserved',420668800);
 update private.model_trial set calls_reserved=calls_reserved+2,held_nusd=held_nusd+420668800,active_request=p_request,warnings=new_warnings where singleton;
 return jsonb_build_object('dispatch',true,'calls_reserved',t.calls_reserved+2,'reserved_nusd',420668800,'warnings',new_warnings,'deadline',t.deadline);
end $$;

-- Server-side verified actor only; this helper is NOT callable by client roles.
create function private.has_org_role_for_model_trial(p_org uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.organization_members where organization_id=p_org and user_id=p_actor and role='owner');
$$;
revoke all on function private.has_org_role_for_model_trial(uuid,uuid) from public,anon,authenticated,service_role;

create function public.model_trial_settle(p_request uuid,p_input integer,p_output integer,p_result text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.model_trial; a private.model_trial_attempts; cost bigint; unknown boolean; begin
 select * into t from private.model_trial where singleton for update;
 select * into a from private.model_trial_attempts where request_id=p_request for update;
 if not found then raise exception 'Unknown reservation' using errcode='22023'; end if;
 if p_result is null or p_result not in ('ok','refusal','invalid_output','incomplete','scope_changed','provider_failure','usage_unknown','count_over_limit')
 then raise exception 'Invalid outcome' using errcode='22023'; end if;
 unknown:=p_input is null or p_output is null or p_input<0 or p_output<0 or p_input>2048 or p_output>1024;
 if a.state<>'reserved' then
  if a.result_code is distinct from p_result or a.input_tokens is distinct from p_input or a.output_tokens is distinct from p_output
  then raise exception 'Settlement differs' using errcode='22023'; end if;
  return jsonb_build_object('state',a.state,'warnings',t.warnings);
 end if;
 if t.active_request is distinct from p_request then raise exception 'Reservation mismatch' using errcode='55000'; end if;
 if unknown then
  -- Timeout, no usage, out-of-policy usage: NEVER release held budget or resume.
  update private.model_trial_attempts set state='unknown',result_code=p_result,input_tokens=p_input,output_tokens=p_output,settled_at=clock_timestamp() where request_id=p_request;
  update private.model_trial set state='paused',active_request=null where singleton;
 else
  cost:=p_input::bigint*400+p_output::bigint*1600;
  if cost>a.reserved_nusd then raise exception 'Cost exceeds reservation' using errcode='54000'; end if;
  update private.model_trial_attempts set state='settled',actual_nusd=cost,input_tokens=p_input,output_tokens=p_output,result_code=p_result,settled_at=clock_timestamp() where request_id=p_request;
  update private.model_trial set held_nusd=held_nusd-a.reserved_nusd,spent_nusd=spent_nusd+cost,active_request=null where singleton;
 end if;
 select * into t from private.model_trial where singleton;
 return jsonb_build_object('state',t.state,'calls_reserved',t.calls_reserved,'spent_nusd',t.spent_nusd,'held_nusd',t.held_nusd,'warnings',t.warnings);
end $$;
revoke all on function public.model_trial_reserve(uuid,uuid,uuid,text,text,integer),public.model_trial_settle(uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.model_trial_reserve(uuid,uuid,uuid,text,text,integer),public.model_trial_settle(uuid,integer,integer,text) to service_role;

create function public.model_trial_authorize_dispatch(p_request uuid,p_actor uuid,p_org uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.model_trial; begin
 select * into t from private.model_trial where singleton for update;
 if t.state is distinct from 'active' or t.active_request is distinct from p_request
 or t.actor_user_id is distinct from p_actor or t.organization_id is distinct from p_org
 or not private.has_org_role_for_model_trial(p_org,p_actor)
 or clock_timestamp()>=t.deadline-interval '1 minute'
 or not exists(select from private.model_trial_attempts where request_id=p_request and state='reserved')
 then raise exception 'Dispatch no longer permitted' using errcode='42501'; end if;
 return jsonb_build_object('deadline',t.deadline,'policy_version',t.policy_version);
end $$;
revoke all on function public.model_trial_authorize_dispatch(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.model_trial_authorize_dispatch(uuid,uuid,uuid) to service_role;
