-- OFFLINE CANDIDATE ONLY. Empty pilot + existing Supabase Auth are the prerequisites.
-- No public function is executable by API roles until separately approved.
begin;
create schema r7_private;
revoke all on schema r7_private from public, anon, authenticated, service_role;
create function r7_private.fixed_frame() returns json language sql immutable set search_path = '' as $fn$
select $r7${
  "sha256": "d14cf60a8c34cd648d95e8ed3f34bd3254e8a8def098cfebca9c67fcd60258cd",
  "payload": {
    "schema_version": 1,
    "trial": "INTRO-GHA-01-R7",
    "run_id": "37967220375",
    "workflow_sha": "0d6a4d231f823ba8602cecdac8018153324eaa43",
    "source_sha": "a20776cdfdb399a5e0b9c4d5a48021155f7b657d",
    "result_sha256": "fb92927b097885479f2e1c711f17de287753a6f90a33cd55a284e6a17b1b72ff",
    "review_status": "PENDING_INDEPENDENT_REVIEW",
    "candidate": {
      "schema_version": 2,
      "trial": "INTRO-TRIAL-01-R1",
      "source": {
        "url": "https://growthos.genman.work/ai-citation-check",
        "version": "7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d",
        "fields": {
          "page_name": "Free AI citation check · GrowthOS",
          "heading": "Is AI recommending your brand?",
          "intro_description": "Enter your website and brand name. We check your brand identity, ask AI engines three real buyer questions and show what to fix first.",
          "meta_description": "Free AI citation check: see whether AI engines cite your brand for three real buyer questions, which brand identity issues to fix and your simplified readiness score. No account needed."
        }
      },
      "source_hash": "ee76a0a8b06ca185974d22b6de8100910bc4945674302c81ec475ec81910ba08",
      "output": {
        "candidate": "輸入您的網站與品牌名稱。我們會檢查您的品牌識別，向 AI 引擎提出三個真實買家問題，並顯示應先修正的項目。",
        "reason": "此改寫保留了原文的動作關係與順序，並依要求將「ask AI engines three real buyer questions」表述為由服務向 AI 引擎提問，而不是由訪客提問；同時避免把品牌識別檢查改寫成 AI 引擎已辨識品牌的主張，也未新增任何效能、結果或保證。",
        "citations": [
          {
            "field": "intro_description",
            "quote": "Enter your website and brand name. We check your brand identity, ask AI engines three real buyer questions and show what to fix first."
          }
        ]
      },
      "receipt": {
        "mode": "live",
        "model": "gpt-5.4-mini-2026-03-17",
        "response_id": "resp_05a51269b6ac8a20016ac925e3832087d280312eab89f714ea",
        "request_id": "req_d9279209436948a787e1dd39633064bd",
        "input_tokens": 369,
        "output_tokens": 185
      }
    },
    "usage": {
      "input_tokens": 369,
      "output_tokens": 185,
      "total_tokens": 554
    },
    "billed_nusd": null
  }
}
$r7$::json
$fn$;
revoke all on function r7_private.fixed_frame() from public, anon, authenticated, service_role;
create table r7_private.members (
 user_id uuid primary key references auth.users(id), organization_id uuid not null,
 role text not null check(role in ('owner','viewer'))
);
create table r7_private.write_gate (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 actor_id uuid references auth.users(id), organization_id uuid, expires_at timestamptz not null default '-infinity'
);
insert into r7_private.write_gate(singleton) values(true);
create table r7_private.versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 created_by uuid not null references auth.users(id), request_id uuid not null,
 version integer not null check(version>0), frame json not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,version),unique(organization_id,request_id),
 check(frame::jsonb = r7_private.fixed_frame()::jsonb)
);
create table r7_private.confirmations (
 version_id uuid primary key references r7_private.versions(id), actor_id uuid not null references auth.users(id),
 request_id uuid not null unique, confirmed_at timestamptz not null default clock_timestamp()
);
create table r7_private.audit (
 organization_id uuid not null, request_id uuid not null, actor_id uuid not null references auth.users(id),
 action text not null check(action in ('save','confirm')), version_id uuid not null references r7_private.versions(id),
 intent jsonb not null, response json not null, recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,request_id)
);
alter table r7_private.members enable row level security;
alter table r7_private.write_gate enable row level security;
alter table r7_private.versions enable row level security;
alter table r7_private.confirmations enable row level security;
alter table r7_private.audit enable row level security;
create policy own_membership on r7_private.members for select to authenticated using(user_id=(select auth.uid()));
create policy own_versions on r7_private.versions for select to authenticated using(exists(select 1 from r7_private.members m where m.user_id=(select auth.uid()) and m.organization_id=versions.organization_id));
create policy own_confirmations on r7_private.confirmations for select to authenticated using(exists(select 1 from r7_private.versions v where v.id=version_id));
create policy own_audit on r7_private.audit for select to authenticated using(exists(select 1 from r7_private.members m where m.user_id=(select auth.uid()) and m.organization_id=audit.organization_id));
-- Views cannot bypass underlying tenant policies; no DML grants to client roles.
create view public.r7_members with(security_invoker=true) as select user_id,organization_id,role from r7_private.members;
create view public.intro_versions with(security_invoker=true) as
 select 'r7_static_intro'::text kind,v.id,v.organization_id,v.created_by,v.request_id,v.version,
 'https://growthos.genman.work/ai-citation-check'::text source_url,
 '7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d'::text source_version,
 '3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04'::text candidate_hash,v.frame,v.created_at,
 case when c.version_id is null then null else json_build_object('version_id',v.id,'version',v.version,
 'candidate_hash','3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04',
 'source_version','7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d',
 'actor_id',c.actor_id,'request_id',c.request_id,'confirmed_at',c.confirmed_at) end confirmation
 from r7_private.versions v left join r7_private.confirmations c on c.version_id=v.id;
revoke all on all tables in schema r7_private from public,anon,authenticated,service_role;
revoke all on public.r7_members,public.intro_versions from public,anon,authenticated,service_role;
-- Deliberately justified definer: clients have no direct DML; one transaction validates
-- verified auth.uid + explicit membership + bounded gate, appends version/audit atomically.
-- Kept private; public wrappers are invokers. Never trust user_metadata or client actor.
create function r7_private.mutate(p_action text,p_org uuid,p_request uuid,p_expected integer,p_hash text,p_source text,p_frame json,p_version uuid)
returns json language plpgsql security definer set search_path='' as $fn$
declare who uuid:=auth.uid(); last_version r7_private.versions%rowtype; prior r7_private.audit%rowtype;
 intent jsonb; outrow json; vid uuid; gate r7_private.write_gate%rowtype;
begin
 if who is null or p_org is null or p_request is null or p_expected is null or p_expected<0 or p_action is null or p_action not in ('save','confirm') then raise exception 'invalid identity/intent' using errcode='22023';end if;
 if not exists(select 1 from r7_private.members where user_id=who and organization_id=p_org and role='owner') then raise exception 'owner required' using errcode='42501';end if;
 if not exists(select 1 from r7_private.write_gate where enabled and actor_id=who and organization_id=p_org and expires_at>clock_timestamp()) then raise exception 'writer closed' using errcode='42501';end if;
 if p_hash is distinct from '3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04' or p_source is distinct from '7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d' then raise exception 'R7 binding mismatch' using errcode='22023';end if;
 if p_action='save' and (p_frame is null or p_frame::jsonb is distinct from r7_private.fixed_frame()::jsonb or p_version is not null) then raise exception 'R7 frame mismatch' using errcode='22023';end if;
 if p_action='confirm' and (p_frame is not null or p_version is null) then raise exception 'confirmation target required' using errcode='22023';end if;
 intent:=jsonb_build_object('action',p_action,'org',p_org,'request',p_request,'expected',p_expected,'hash',p_hash,'source',p_source,'frame',p_frame,'version',p_version);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 -- A queued writer has not been admitted. Read the CURRENT gate after the org
 -- lock, then hold SHARE through transaction completion. disable's UPDATE
 -- either precedes admission (writer rejects), or waits for that writer.
 select * into gate from r7_private.write_gate where singleton for share;
 if not found or not gate.enabled or gate.actor_id is distinct from who or gate.organization_id is distinct from p_org or gate.expires_at<=clock_timestamp() then raise exception 'writer closed after lock' using errcode='42501';end if;
 select * into prior from r7_private.audit where organization_id=p_org and request_id=p_request;
 if found then
  if prior.actor_id<>who or prior.intent<>intent then raise exception 'request reuse mismatch' using errcode='23505';end if;
  return prior.response;
 end if;
 select * into last_version from r7_private.versions where organization_id=p_org order by version desc limit 1;
 if coalesce(last_version.version,0)<>p_expected then raise exception 'stale version' using errcode='40001';end if;
 if p_action='save' then
  insert into r7_private.versions(organization_id,created_by,request_id,version,frame)
  values(p_org,who,p_request,p_expected+1,r7_private.fixed_frame()) returning id into vid;
 else
  if last_version.id is distinct from p_version then raise exception 'stale target' using errcode='40001';end if;
  insert into r7_private.confirmations(version_id,actor_id,request_id) values(p_version,who,p_request);vid:=p_version;
 end if;
 select row_to_json(v) into outrow from public.intro_versions v where id=vid;
 insert into r7_private.audit(organization_id,request_id,actor_id,action,version_id,intent,response) values(p_org,p_request,who,p_action,vid,intent,outrow);
 -- A later lock/trigger delay inside this statement must also roll back on expiry.
 if gate.expires_at<=clock_timestamp() then raise exception 'writer expired before return' using errcode='42501';end if;
 return outrow;
end $fn$;
create function public.save_r7_intro(p_organization_id uuid,p_request_id uuid,p_expected_version integer,p_candidate_hash text,p_source_version text,p_frame json)
returns json language sql security invoker set search_path='' as $fn$
 select r7_private.mutate('save',p_organization_id,p_request_id,p_expected_version,p_candidate_hash,p_source_version,p_frame,null)
$fn$;
create function public.confirm_r7_intro(p_organization_id uuid,p_request_id uuid,p_expected_version integer,p_candidate_hash text,p_source_version text,p_version_id uuid)
returns json language sql security invoker set search_path='' as $fn$
 select r7_private.mutate('confirm',p_organization_id,p_request_id,p_expected_version,p_candidate_hash,p_source_version,null,p_version_id)
$fn$;
revoke all on all functions in schema r7_private from public,anon,authenticated,service_role;
revoke all on function public.save_r7_intro(uuid,uuid,integer,text,text,json),public.confirm_r7_intro(uuid,uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;
-- Read grants are also CLOSED by default. Activation is a separately reviewed transaction.
commit;
