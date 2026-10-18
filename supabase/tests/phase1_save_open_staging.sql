-- Phase 1 isolated-staging opening for the First Result -> Workspace save chain.
-- Target project ONLY: vhzryhibmpvglzcmfnaa (isolated staging, synthetic data).
-- This mirrors the established opening operation used by prior bounded trials
-- (see supabase/drafts/url_result/bound/*/opening.sql). The RPC itself remains
-- owner-only: private.save_url_result_draft_impl re-checks auth.uid() and
-- owner membership inside the transaction. Granting EXECUTE does not grant
-- any table write access and does not affect anon/service_role.
--
-- Execute once in the staging project's SQL editor (postgres role).
grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),
  private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;

-- Verification: both functions must list authenticated EXECUTE (true).
select p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
  and p.proname in ('save_url_result_draft','save_url_result_draft_impl')
order by n.nspname, p.proname;

-- Rollback (closes the chain again; saved drafts remain readable per RLS):
-- revoke execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),
--   private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from authenticated;
