-- REVIEW DRAFT: only these exact probe objects; never DROP OWNED/CASCADE.
-- First controller rolls back and closes A/B/C. Admin denies new login next.
ALTER ROLE growth_os_probe_login NOLOGIN;
BEGIN;
-- Revoke object ACL as its owner, not merely a role with ADMIN membership.
GRANT growth_os_probe_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;
SET LOCAL ROLE growth_os_probe_owner;
REVOKE EXECUTE ON FUNCTION growth_os_probe.append_fixture_turn() FROM growth_os_probe_login;
RESET ROLE;
REVOKE growth_os_probe_owner FROM CURRENT_USER;
COMMIT;
-- Only terminate this role's remaining sessions, if any. No other role matches.
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE usename='growth_os_probe_login' AND pid<>pg_backend_pid();
BEGIN;
DROP FUNCTION growth_os_probe.append_fixture_turn();
REVOKE SELECT ON TABLE growth_os_probe.activation_window FROM growth_os_probe_owner;
DROP TABLE growth_os_probe.activation_window;
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
