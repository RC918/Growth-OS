-- Approved management action, separate from optional removal. No budget refund.
-- For an activated/paused trial; do not reset times, spend, held budget or calls.
UPDATE private.model_trial SET state='closed' WHERE singleton AND starts_at IS NOT NULL;
-- Runtime readiness flags must be disabled before any later exact cleanup.
-- Do not drop metadata with an active request/unreconciled usage. No CASCADE.
