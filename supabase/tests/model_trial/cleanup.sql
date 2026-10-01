-- REVIEW ONLY: disable runtime flags first; stop admission and reconcile usage.
-- Never discard active/unknown reservations or refund/reset quota to allow retry.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM private.model_trial WHERE singleton
 AND state IN ('staged','closed') AND active_request IS NULL AND held_nusd=0)
 OR EXISTS(SELECT FROM private.model_trial_attempts WHERE state<>'settled')
 THEN RAISE EXCEPTION 'Unreconciled trial; preserve ledger and stop'; END IF;
END $$;
DROP FUNCTION public.model_trial_authorize_dispatch(uuid,uuid,uuid);
DROP FUNCTION public.model_trial_reserve(uuid,uuid,uuid,text,text,integer);
DROP FUNCTION public.model_trial_settle(uuid,integer,integer,text);
DROP FUNCTION private.has_org_role_for_model_trial(uuid,uuid);
DROP TABLE private.model_trial_attempts;
DROP TABLE private.model_trial;
COMMIT;
-- No CASCADE, DROP OWNED, existing role/table/RLS changes or business-data deletion.
