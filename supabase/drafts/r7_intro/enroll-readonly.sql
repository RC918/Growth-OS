-- OFFLINE CANDIDATE: requires separate review and verified invitation identity.
-- Supply r7.actor_id and r7.organization_id privately; never invent either here.
-- First enrollment only. Does not start or extend the writer deadline.
begin;
do $$
declare actor uuid:=current_setting('r7.actor_id')::uuid;
 org uuid:=current_setting('r7.organization_id')::uuid;
 gate r7_private.write_gate%rowtype;
begin
 if actor is null or org is null then raise exception 'verified actor and dedicated organization required';end if;
 if not exists(select 1 from auth.users where id=actor) then raise exception 'existing invited Auth user required';end if;
 select * into gate from r7_private.write_gate where singleton for update;
 if not found or gate.enabled or gate.actor_id is not null or gate.organization_id is not null or gate.expires_at>clock_timestamp() then raise exception 'untouched closed gate required';end if;
 if exists(select 1 from r7_private.members where user_id=actor and (organization_id<>org or role<>'owner')) then raise exception 'membership mismatch';end if;
 if exists(select 1 from r7_private.members where organization_id=org and user_id<>actor) then raise exception 'dedicated organization required';end if;
 insert into r7_private.members(user_id,organization_id,role) values(actor,org,'owner') on conflict(user_id) do nothing;
end $$;
grant usage on schema r7_private to authenticated;
grant select on r7_private.members,r7_private.versions,r7_private.confirmations,public.r7_members,public.intro_versions to authenticated;
revoke all on function r7_private.mutate(text,uuid,uuid,integer,text,text,json,uuid),public.save_r7_intro(uuid,uuid,integer,text,text,json),public.confirm_r7_intro(uuid,uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;
commit;
