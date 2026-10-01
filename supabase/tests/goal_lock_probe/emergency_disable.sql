-- Execute EACH action separately; do not wrap with fallible ACL/object cleanup.
-- 1: admin apply_migration; commit NOLOGIN independently.
ALTER ROLE growth_os_probe_login NOLOGIN;
-- 2: admin execute_sql; terminate only exact probe sessions.
SELECT pid,pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
 WHERE usename='growth_os_probe_login' AND pid<>pg_backend_pid();
-- 3: admin execute_sql; require false / zero, repeat exact-role termination if needed.
SELECT (SELECT rolcanlogin FROM pg_roles WHERE rolname='growth_os_probe_login') AS can_login,
 (SELECT count(*) FROM pg_stat_activity WHERE usename='growth_os_probe_login') AS sessions;
