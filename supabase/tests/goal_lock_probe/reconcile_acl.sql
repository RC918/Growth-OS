-- REVIEW ONLY: isolated project exact OID18474. No LOGIN/window/secret changes.
BEGIN;
CREATE TEMP TABLE probe_reconcile_before ON COMMIT DROP AS
SELECT to_jsonb(p)-'proacl' AS definition,
 (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.oid),'[]'::jsonb) FROM pg_auth_members m
 WHERE m.roleid IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole)
 OR m.member IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole)) AS memberships,
 (SELECT jsonb_agg(jsonb_build_array(r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,
 r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil) ORDER BY r.oid)
 FROM pg_roles r WHERE r.rolname IN ('growth_os_probe_owner','growth_os_probe_login')) AS roles,
 (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.singleton) FROM growth_os_probe.activation_window w) AS window_state
FROM pg_proc p WHERE p.oid=18474::oid;
DO $$ DECLARE edges jsonb; expected jsonb; BEGIN
 IF current_user <> 'postgres' OR session_user <> 'postgres'
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='postgres' AND NOT rolsuper AND rolcreaterole)
 THEN RAISE EXCEPTION 'Operator drift'; END IF;
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.oid=18474::oid AND n.nspname='growth_os_probe' AND p.proname='append_fixture_turn'
 AND p.pronargs=0 AND p.prokind='f' AND p.prorettype='jsonb'::regtype
 AND p.proowner='growth_os_probe_owner'::regrole AND p.prosecdef
 AND p.proconfig=ARRAY['search_path=""','lock_timeout=5s'])
 THEN RAISE EXCEPTION 'Exact OID/signature/owner/config drift'; END IF;
 SELECT jsonb_agg(jsonb_build_array(x.grantee,x.grantor,x.privilege_type,x.is_grantable) ORDER BY x.grantee)
 INTO edges FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE p.oid=18474::oid;
 SELECT jsonb_agg(jsonb_build_array(grantee,'growth_os_probe_owner'::regrole::oid,'EXECUTE',false) ORDER BY grantee)
 INTO expected FROM (VALUES(0::oid),('growth_os_probe_owner'::regrole::oid)) e(grantee);
 IF edges IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Original ACL drift'; END IF;
 IF (SELECT jsonb_array_length(memberships) FROM probe_reconcile_before) <> 2
 OR EXISTS(SELECT FROM pg_auth_members m WHERE
 (m.roleid IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole)
 OR m.member IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole))
 AND NOT(m.roleid IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole)
 AND m.member='postgres'::regrole AND m.grantor='supabase_admin'::regrole
 AND m.admin_option AND NOT m.set_option AND NOT m.inherit_option))
 THEN RAISE EXCEPTION 'Full original membership drift'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('growth_os_probe_owner','growth_os_probe_login')
 AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication))
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='growth_os_probe_login' AND rolconnlimit=3
 AND rolvaliduntil='1970-01-01 00:00:00+00'::timestamptz)
 OR (SELECT count(*) FROM growth_os_probe.activation_window) <> 1
 OR NOT EXISTS(SELECT FROM growth_os_probe.activation_window WHERE singleton AND starts_at IS NULL AND deadline IS NULL)
 THEN RAISE EXCEPTION 'NOLOGIN/window staging drift'; END IF;
END $$;
-- Add only a new grantor=postgres edge; never modify supabase_admin's edge.
GRANT growth_os_probe_owner TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
SET LOCAL ROLE growth_os_probe_owner;
REVOKE ALL ON FUNCTION growth_os_probe.append_fixture_turn() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION growth_os_probe.append_fixture_turn() TO growth_os_probe_login;
-- FAILURE_INJECTION_POINT (test harness only)
RESET ROLE;
REVOKE growth_os_probe_owner FROM postgres GRANTED BY postgres RESTRICT;
DO $$ DECLARE edges jsonb; expected jsonb; BEGIN
 SELECT jsonb_agg(jsonb_build_array(x.grantee,x.grantor,x.privilege_type,x.is_grantable) ORDER BY x.grantee)
 INTO edges FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE p.oid=18474::oid;
 SELECT jsonb_agg(jsonb_build_array(grantee,'growth_os_probe_owner'::regrole::oid,'EXECUTE',false) ORDER BY grantee)
 INTO expected FROM (VALUES('growth_os_probe_login'::regrole::oid),('growth_os_probe_owner'::regrole::oid)) e(grantee);
 IF edges IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Final exact ACL mismatch'; END IF;
 IF (SELECT to_jsonb(p)-'proacl' FROM pg_proc p WHERE p.oid=18474::oid)
 IS DISTINCT FROM (SELECT definition FROM probe_reconcile_before)
 THEN RAISE EXCEPTION 'Function definition/owner changed'; END IF;
 IF (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.oid),'[]'::jsonb) FROM pg_auth_members m
 WHERE m.roleid IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole)
 OR m.member IN ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole))
 IS DISTINCT FROM (SELECT memberships FROM probe_reconcile_before)
 THEN RAISE EXCEPTION 'Original grantor/membership changed'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,
 r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil) ORDER BY r.oid)
 FROM pg_roles r WHERE r.rolname IN ('growth_os_probe_owner','growth_os_probe_login'))
 IS DISTINCT FROM (SELECT roles FROM probe_reconcile_before)
 THEN RAISE EXCEPTION 'Role attributes changed'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.singleton) FROM growth_os_probe.activation_window w)
 IS DISTINCT FROM (SELECT window_state FROM probe_reconcile_before)
 THEN RAISE EXCEPTION 'Activation window changed'; END IF;
END $$;
COMMIT;
