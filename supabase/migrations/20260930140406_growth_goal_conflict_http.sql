-- Local fix; not applied to isolated Supabase yet.
-- A stale expected_version is an API conflict, not a retryable SQL transaction.
-- Preserve the invoker boundary and all existing grants/membership checks.
create or replace function public.save_goal_turn(p_organization_id uuid,p_goal_id uuid,p_request_id uuid,
 p_expected_version integer,p_question_key text,p_answer text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 return private.save_goal_turn_impl(p_organization_id,p_goal_id,p_request_id,
  p_expected_version,p_question_key,p_answer);
exception when serialization_failure then
 raise exception 'Goal version changed; reload' using errcode='PT409';
end $$;
