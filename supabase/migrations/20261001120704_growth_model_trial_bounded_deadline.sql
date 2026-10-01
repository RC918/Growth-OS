-- Narrow follow-up to the already-applied budget migration. No activation/DML.
-- Remote application requires review of this exact constraint-only change.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT FROM pg_catalog.pg_constraint
  WHERE conrelid='private.model_trial'::regclass AND conname='model_trial_check1'
  AND contype='c' AND convalidated
  AND pg_catalog.pg_get_constraintdef(oid,true) =
  'CHECK (starts_at IS NULL AND deadline IS NULL AND state = ''staged''::text OR starts_at IS NOT NULL AND deadline = (starts_at + ''7 days''::interval) AND actor_user_id IS NOT NULL AND organization_id IS NOT NULL)'
 ) THEN RAISE EXCEPTION 'Original trial deadline constraint differs'; END IF;
END $$;
ALTER TABLE private.model_trial DROP CONSTRAINT model_trial_check1;
ALTER TABLE private.model_trial ADD CONSTRAINT model_trial_check1 CHECK (
 (state='staged' AND starts_at IS NULL AND deadline IS NULL)
 OR
 (state IN ('active','paused','closed') AND starts_at IS NOT NULL
  AND deadline IS NOT NULL AND deadline>starts_at
  AND deadline<=starts_at+interval '7 days'
  AND actor_user_id IS NOT NULL AND organization_id IS NOT NULL)
);
COMMIT;
