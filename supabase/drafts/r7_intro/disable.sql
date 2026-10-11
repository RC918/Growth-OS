-- Preserve immutable evidence and authenticated RLS readback; revoke every writer entry.
-- UPDATE conflicts with admitted writers' gate SHARE locks. Completion means
-- those transactions finished and every not-yet-admitted writer must reject.
-- It does not retroactively cancel a writer already admitted before this UPDATE.
begin;
update r7_private.write_gate set enabled=false,expires_at='-infinity';
revoke all on function r7_private.mutate(text,uuid,uuid,integer,text,text,json,uuid),public.save_r7_intro(uuid,uuid,integer,text,text,json),public.confirm_r7_intro(uuid,uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;
commit;
