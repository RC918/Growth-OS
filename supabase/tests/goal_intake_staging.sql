-- Isolated Growth OS only. Synthetic claims and goals, all writes rolled back.
begin;
select set_config('growth_m1.owner',(select user_id::text from public.organization_members where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and role='owner' limit 1),true);
select set_config('growth_m1.viewer',(select user_id::text from public.organization_members where organization_id='93a88055-0a0b-40c0-b22f-a6d312320002' and role='viewer' limit 1),true);
select set_config('growth_m1.org',gen_random_uuid()::text,true);
select set_config('growth_m1.goal',gen_random_uuid()::text,true);
select set_config('growth_m1.request',gen_random_uuid()::text,true);
insert into public.organizations(id,name,business_model) values(current_setting('growth_m1.org')::uuid,'Synthetic M1 rollback only','ecommerce');
insert into public.organization_members(organization_id,user_id,role) values
 (current_setting('growth_m1.org')::uuid,current_setting('growth_m1.owner')::uuid,'owner'),
 (current_setting('growth_m1.org')::uuid,current_setting('growth_m1.viewer')::uuid,'viewer');
select set_config('request.jwt.claim.sub',current_setting('growth_m1.owner'),true);
set local role authenticated;
do $$
declare org uuid:=current_setting('growth_m1.org')::uuid; goal uuid:=current_setting('growth_m1.goal')::uuid;
 req uuid:=current_setting('growth_m1.request')::uuid; n integer:=1; field text; result jsonb;
begin
 result:=public.save_goal_turn(org,goal,req,0,'goal','合成驗收：讓海外買家找到產品');
 perform public.save_goal_turn(org,goal,req,0,'goal','合成驗收：讓海外買家找到產品');
 if (select count(*) from public.growth_goal_turns where goal_id=goal)<>1 then raise exception 'Duplicate retry';end if;
 begin perform public.save_goal_turn(org,goal,req,0,'goal','Changed retry');raise exception 'Changed retry accepted';exception when invalid_parameter_value then null;end;
 begin perform public.save_goal_turn(org,goal,gen_random_uuid(),1,'confirm','確認');raise exception 'Early confirm accepted';exception when invalid_parameter_value then null;end;
 begin perform public.save_goal_turn(org,goal,gen_random_uuid(),1,'market','歐洲');raise exception 'Skipped question accepted';exception when invalid_parameter_value then null;end;
 foreach field in array array['offering','audience','market','channel','asset','metric'] loop
  perform public.save_goal_turn(org,goal,gen_random_uuid(),n,field,case when field='asset' then '尚無連結' else 'Synthetic answer' end);n:=n+1;
 end loop;
 perform public.save_goal_turn(org,goal,gen_random_uuid(),n,'confirm','確認');n:=n+1;
 begin perform public.save_goal_turn(org,goal,gen_random_uuid(),n-1,'audience','Stale');raise exception 'Stale accepted';exception when serialization_failure then null;end;
 perform public.save_goal_turn(org,goal,gen_random_uuid(),n,'audience','Synthetic corrected audience');n:=n+1;
 if (select answer_text from public.growth_goal_turns where goal_id=goal and version_number=3)<>'Synthetic answer' then raise exception 'History overwritten';end if;
 if (select question_key from public.growth_goal_turns where goal_id=goal order by version_number desc limit 1)='confirm' then raise exception 'Confirmation not invalidated';end if;
 if (select count(*) from public.audit_events where organization_id=org and object_id=goal and event_type='goal_turn_saved')<>n then raise exception 'Audit missing';end if;
 begin update public.growth_goal_turns set answer_text='tamper' where goal_id=goal;raise exception 'Direct update accepted';exception when insufficient_privilege then null;end;
 begin delete from public.growth_goal_turns where goal_id=goal;raise exception 'Direct delete accepted';exception when insufficient_privilege then null;end;
 begin insert into public.growth_goals(id,organization_id,actor_user_id) values(gen_random_uuid(),org,auth.uid());raise exception 'Direct insert accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('growth_m1.viewer'),true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.growth_goal_turns where goal_id=current_setting('growth_m1.goal')::uuid)<>9 then raise exception 'Same-org viewer cannot read';end if;
 if exists(select 1 from public.growth_goals where organization_id='93a88055-0a0b-40c0-b22f-a6d312320001') then raise exception 'Cross tenant leak';end if;
 begin perform public.save_goal_turn(current_setting('growth_m1.org')::uuid,current_setting('growth_m1.goal')::uuid,gen_random_uuid(),9,'confirm','確認');raise exception 'Viewer append accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_goal_turn('93a88055-0a0b-40c0-b22f-a6d312320001',gen_random_uuid(),gen_random_uuid(),0,'goal','Foreign');raise exception 'Foreign append accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.organization_members where organization_id=current_setting('growth_m1.org')::uuid and user_id=current_setting('growth_m1.owner')::uuid;
select set_config('request.jwt.claim.sub',current_setting('growth_m1.owner'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.growth_goals where id=current_setting('growth_m1.goal')::uuid) then raise exception 'Revoked member read';end if;
 begin perform public.save_goal_turn(current_setting('growth_m1.org')::uuid,current_setting('growth_m1.goal')::uuid,current_setting('growth_m1.request')::uuid,0,'goal','合成驗收：讓海外買家找到產品');raise exception 'Revoked replay accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform * from public.growth_goals;raise exception 'Anonymous read accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_goal_turn(current_setting('growth_m1.org')::uuid,current_setting('growth_m1.goal')::uuid,gen_random_uuid(),0,'goal','Anonymous');raise exception 'Anonymous call accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: owner append/retry/version/audit; viewer read/deny; cross-tenant denial; current membership revocation; anon and direct writes denied; rollback only' as result;
rollback;
