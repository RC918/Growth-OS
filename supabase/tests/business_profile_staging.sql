-- Isolated Growth OS Staging. Synthetic rows and claims; entire test rolls back.
begin;

insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values
 ('63a88055-0a0b-40c0-b22f-a6d312410001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','profile-owner-a@example.invalid',now(),now()),
 ('63a88055-0a0b-40c0-b22f-a6d312410002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','profile-viewer-a@example.invalid',now(),now()),
 ('63a88055-0a0b-40c0-b22f-a6d312410003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','profile-owner-b@example.invalid',now(),now());
insert into public.organizations (id,name,business_model) values
 ('63a88055-0a0b-40c0-b22f-a6d312420001','Profile A','ecommerce'),
 ('63a88055-0a0b-40c0-b22f-a6d312420002','Profile B','trade');
insert into public.organization_members (organization_id,user_id,role) values
 ('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312410001','owner'),
 ('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312410002','viewer'),
 ('63a88055-0a0b-40c0-b22f-a6d312420002','63a88055-0a0b-40c0-b22f-a6d312410003','owner');
insert into public.sites (id,organization_id,origin,verified_at) values
 ('63a88055-0a0b-40c0-b22f-a6d312430001','63a88055-0a0b-40c0-b22f-a6d312420001','https://profile-a.example.invalid',now()),
 ('63a88055-0a0b-40c0-b22f-a6d312430002','63a88055-0a0b-40c0-b22f-a6d312420001','https://pending-profile.example.invalid',null),
 ('63a88055-0a0b-40c0-b22f-a6d312430003','63a88055-0a0b-40c0-b22f-a6d312420002','https://profile-b.example.invalid',now());

do $$ begin
 if has_function_privilege('anon','public.save_business_profile(uuid,uuid,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.approve_business_profile(uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.save_business_profile(uuid,uuid,text,text,text,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.approve_business_profile(uuid)','EXECUTE') then
   raise exception 'RPC grants incorrect';
 end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','63a88055-0a0b-40c0-b22f-a6d312410002',true);
do $$ begin
 begin
  perform public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001',null,'Name','Audience','Offering','order','Taiwan');
  raise exception 'viewer saved';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.approve_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001');
  raise exception 'viewer approved';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub','63a88055-0a0b-40c0-b22f-a6d312410003',true);
do $$ begin
 begin
  perform public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001',null,'Name','Audience','Offering','order','Taiwan');
  raise exception 'cross tenant saved';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub','63a88055-0a0b-40c0-b22f-a6d312410001',true);
do $$ begin
 begin
  perform public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312430002','Name','Audience','Offering','order','Taiwan');
  raise exception 'unverified site accepted';
 exception when check_violation then null;
 end;
 begin
  perform public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312430003','Name','Audience','Offering','order','Taiwan');
  raise exception 'foreign site accepted';
 exception when check_violation then null;
 end;
 begin
  perform public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001',null,' ','Audience','Offering','order','Taiwan');
  raise exception 'blank name accepted';
 exception when invalid_parameter_value then null;
 end;
end $$;

select public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312430001','  Synthetic Shop  ','Synthetic buyer','Synthetic goods','order','Taiwan');
select public.approve_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001');
select public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312430001','Synthetic Shop','Synthetic buyer','Synthetic goods','order','Taiwan');
do $$ begin
 if (select review_status from public.business_profiles where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001') <> 'owner_approved'
    or (select count(*) from public.audit_events where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001') <> 2 then
   raise exception 'identical save invalidated approval';
 end if;
 begin
  perform public.approve_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001');
  raise exception 'duplicate approval accepted';
 exception when unique_violation then null;
 end;
end $$;

select public.save_business_profile('63a88055-0a0b-40c0-b22f-a6d312420001','63a88055-0a0b-40c0-b22f-a6d312430001','Synthetic Shop','Updated synthetic buyer','Synthetic goods','order','Taiwan');
reset role;
do $$ begin
 if (select count(*) from public.business_profiles where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001') <> 1
   or exists (select 1 from public.business_profiles where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001' and (review_status <> 'draft' or reviewed_by is not null or reviewed_at is not null))
   or (select count(*) from public.audit_events where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001' and event_type='business_profile_saved') <> 2
   or (select count(*) from public.audit_events where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001' and event_type='business_profile_approved') <> 1
   or exists (select 1 from public.audit_events where organization_id='63a88055-0a0b-40c0-b22f-a6d312420001' and actor_user_id <> '63a88055-0a0b-40c0-b22f-a6d312410001') then
   raise exception 'profile state/audit mismatch';
 end if;
end $$;

rollback;
select 'PASS: owner-only profile save/approve, unchanged no-op, edit invalidation, tenant/site denial, audit; rolled back' as result;
