-- Run through THREE separate TLS sessions as the probe LOGIN, never an admin.
-- This file is a review checklist, not a sequential concurrency test.
-- C observes A/B own-role sessions; barrier controller must see B blocked by A.
SELECT pid,application_name,state,wait_event_type,wait_event,
 pg_blocking_pids(pid) AS blockers
FROM pg_stat_activity WHERE usename='growth_os_probe_login';
-- A: BEGIN; SELECT growth_os_probe.append_fixture_turn(); hold only until C confirms B.
-- B: BEGIN; SELECT growth_os_probe.append_fixture_turn(); must wait while A holds its lock.
-- C: record different A/B PIDs, B wait_event_type='Lock', and A in B blockers.
-- A: ROLLBACK; B must return version 14, then B: ROLLBACK. Close A/B/C.
-- Each session: statement_timeout=15s, idle transaction=30s; client deadline=20s.
-- Final existing trusted read-only audit: same 13 turns/audit, identical prior history.
-- Role defaults can be changed by SQL clients. VALID UNTIL does not end live sessions.
-- This proof is lock waiting/rollback; use prior evidence for stale PT409 refusal.
