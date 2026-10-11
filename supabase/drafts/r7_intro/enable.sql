-- NOT EXECUTED REMOTELY. Run only after approved scoped preflight and SQL/hash review.
-- Supply transaction/session settings r7.actor_id, r7.organization_id, r7.expires_at
-- from VERIFIED existing Auth identity and approved tenant; no values in this file.
begin;
do $$
declare actor uuid:=current_setting('r7.actor_id')::uuid; org uuid:=current_setting('r7.organization_id')::uuid; deadline timestamptz:=current_setting('r7.expires_at')::timestamptz;
begin
 if deadline<=clock_timestamp() or deadline>clock_timestamp()+interval '1 hour' then raise exception 'bounded deadline required';end if;
 if not exists(select 1 from auth.users where id=actor) then raise exception 'existing Auth user required';end if;
 if exists(select 1 from r7_private.members where user_id=actor and (organization_id<>org or role<>'owner')) then raise exception 'membership mismatch';end if;
 insert into r7_private.members(user_id,organization_id,role) values(actor,org,'owner') on conflict(user_id) do nothing;
 update r7_private.write_gate set enabled=true,actor_id=actor,organization_id=org,expires_at=deadline where singleton;
end $$;
grant usage on schema r7_private to authenticated;
grant select on r7_private.members,r7_private.versions,r7_private.confirmations,r7_private.audit,public.r7_members,public.intro_versions to authenticated;
grant execute on function r7_private.mutate(text,uuid,uuid,integer,text,text,json,uuid),public.save_r7_intro(uuid,uuid,integer,text,text,json),public.confirm_r7_intro(uuid,uuid,integer,text,text,uuid) to authenticated;
commit;
