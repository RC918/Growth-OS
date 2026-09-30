-- REVIEW DRAFT: only these exact probe objects; never DROP OWNED/CASCADE.
-- First controller rolls back and closes A/B/C. Admin denies new login next.
ALTER ROLE growth_os_probe_login NOLOGIN;
REVOKE EXECUTE ON FUNCTION growth_os_probe.append_fixture_turn() FROM growth_os_probe_login;
-- Only terminate this role's remaining sessions, if any. No other role matches.
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE usename='growth_os_probe_login' AND pid<>pg_backend_pid();
BEGIN;
DROP FUNCTION growth_os_probe.append_fixture_turn();
REVOKE EXECUTE ON FUNCTION public.save_goal_turn(uuid,uuid,uuid,integer,text,text),
 private.save_goal_turn_impl(uuid,uuid,uuid,integer,text,text) FROM growth_os_probe_owner;
REVOKE USAGE ON SCHEMA growth_os_probe,public,private FROM growth_os_probe_owner;
REVOKE USAGE ON SCHEMA growth_os_probe FROM growth_os_probe_login;
REVOKE CONNECT ON DATABASE postgres FROM growth_os_probe_login;
DROP SCHEMA growth_os_probe;
-- Unexpected ownership/membership/dependency must fail, never cascade.
DROP ROLE growth_os_probe_login;
DROP ROLE growth_os_probe_owner;
COMMIT;
