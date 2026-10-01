-- Review-only prerequisite. Restore the original approved function ACL only.
-- Does not activate LOGIN/window, change owner, password, or business data.
BEGIN;
-- postgres ADMIN membership alone does not confer object-owner privileges.
-- Temporary SET only, no inheritance; explicitly assume the existing owner.
GRANT growth_os_probe_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;
SET LOCAL ROLE growth_os_probe_owner;
REVOKE ALL ON FUNCTION growth_os_probe.append_fixture_turn() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION growth_os_probe.append_fixture_turn() TO growth_os_probe_login;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 WHERE n.nspname='growth_os_probe' AND p.proname='append_fixture_turn' AND x.grantee=0)
 THEN RAISE EXCEPTION 'PUBLIC probe grant remains'; END IF;
 IF NOT has_function_privilege('growth_os_probe_login','growth_os_probe.append_fixture_turn()','EXECUTE')
 THEN RAISE EXCEPTION 'Explicit probe execution absent'; END IF;
END $$;
RESET ROLE;
REVOKE growth_os_probe_owner FROM CURRENT_USER;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='growth_os_probe_owner'
 AND u.rolname=current_user AND (m.set_option OR m.inherit_option))
 THEN RAISE EXCEPTION 'Temporary owner access remains'; END IF;
END $$;
COMMIT;
