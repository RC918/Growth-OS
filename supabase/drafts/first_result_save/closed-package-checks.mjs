// Shared checks for ephemeral PGlite / native PG17 databases. Never remote.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {bootstrapSQL} from './fixtures.mjs';
const root=new URL('./',import.meta.url);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
export async function checkClosedPackage({exec,scalar},label,{pglite=false}={}) {
 const candidate=await readFile(new URL('closed-package.sql',root),'utf8');
 const proposal=await readFile(new URL('proposal.sql',root),'utf8');
 const ddl=candidate.split('EXECUTE $candidate_ddl$\n')[1].split('$candidate_ddl$;')[0];
 assert.equal(ddl,proposal.replace(/^begin;\n/m,'').replace(/^commit;\n/m,'').replace(/^grant execute on function .* to authenticated;\n/gm,''),'function/constraint bodies must be exactly the accepted proposal; only transaction wrapper and permanent grants removed');
 assert.equal((candidate.match(/DO \$closed_package\$/g)||[]).length,1);
 assert.doesNotMatch(candidate,/^\s*(?:COMMIT|ROLLBACK|SAVEPOINT|DELETE FROM|DROP TABLE)\b/im);
 await exec(bootstrapSQL);
 for(const file of (await readdir(new URL('../../migrations/',root))).filter(n=>n.endsWith('.sql')).sort()) {
  let sql=await readFile(new URL('../../migrations/'+file,root),'utf8');
  if(pglite)sql=sql.replace('create extension if not exists pgcrypto;','');
  await exec(sql);
 }
 await exec(`
 insert into auth.users(id) values('e85f1a90-3565-4fc1-a7e0-3b7d08830d0e'),('5d14dbf9-e9ef-453b-8760-e48a20fa63ad');
 insert into public.organizations(id,name,business_model) values
 ('93a88055-0a0b-40c0-b22f-a6d312320001','Synthetic A','trade'),('93a88055-0a0b-40c0-b22f-a6d312320002','Synthetic B','trade');
 insert into public.organization_members values
 ('93a88055-0a0b-40c0-b22f-a6d312320001','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e','owner'),
 ('93a88055-0a0b-40c0-b22f-a6d312320002','5d14dbf9-e9ef-453b-8760-e48a20fa63ad','viewer');
 insert into public.growth_opportunities(id,organization_id,channel,audience_need,proposed_action,rationale,status,evidence_confidence)
 values('a6f7775d-501f-45e6-b15e-6e8d74a26c09','93a88055-0a0b-40c0-b22f-a6d312320001','organic_search','Synthetic need','Synthetic action','Synthetic rationale','approved','low');
 insert into public.opportunity_sources(organization_id,opportunity_id,source_kind,evidence_note,observed_at)
 values('93a88055-0a0b-40c0-b22f-a6d312320001','a6f7775d-501f-45e6-b15e-6e8d74a26c09','research_note','Synthetic source',now());
 insert into public.opportunity_decisions(organization_id,opportunity_id,actor_user_id,decision,reason)
 values('93a88055-0a0b-40c0-b22f-a6d312320001','a6f7775d-501f-45e6-b15e-6e8d74a26c09','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e','approved','Synthetic decision');
 insert into public.growth_goals(id,organization_id,actor_user_id)
 values('5055ca31-40cc-435d-9f52-cdf19166440c','93a88055-0a0b-40c0-b22f-a6d312320001','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e');
 insert into public.growth_goal_turns(organization_id,goal_id,actor_user_id,request_id,version_number,question_key,question_text,answer_text)
 select '93a88055-0a0b-40c0-b22f-a6d312320001','5055ca31-40cc-435d-9f52-cdf19166440c','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e',gen_random_uuid(),n,'goal','Synthetic question','Synthetic answer '||n from generate_series(1,13)n;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 select '93a88055-0a0b-40c0-b22f-a6d312320001','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e','goal_turn_saved','growth_goal','5055ca31-40cc-435d-9f52-cdf19166440c',jsonb_build_object('synthetic',n) from generate_series(1,13)n;
 insert into public.growth_opportunities(id,organization_id,channel,audience_need,proposed_action,rationale,status,evidence_confidence)
 values('20000000-0000-4000-8000-000000000019','93a88055-0a0b-40c0-b22f-a6d312320001','organic_search','Old synthetic need','Old action','Old rationale','approved','low');
 insert into public.content_versions(id,organization_id,opportunity_id,version_number,title,draft_body,created_by)
 values('40000000-0000-4000-8000-000000000019','93a88055-0a0b-40c0-b22f-a6d312320001','20000000-0000-4000-8000-000000000019',1,'Preserved legacy title','Preserved legacy body','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e');
 insert into public.content_reviews(organization_id,version_id,actor_user_id,decision,reason)
 values('93a88055-0a0b-40c0-b22f-a6d312320001','40000000-0000-4000-8000-000000000019','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e','approved','Preserved synthetic legacy approval');
 update private.model_trial set calls_reserved=4,spent_nusd=470800;
 insert into private.model_trial_attempts(request_id,actor_user_id,organization_id,fixture_id,payload_hash,expected_version,state,reserved_nusd,actual_nusd,input_tokens,output_tokens,result_code)
 values('80000000-0000-4000-8000-000000000001','e85f1a90-3565-4fc1-a7e0-3b7d08830d0e','93a88055-0a0b-40c0-b22f-a6d312320001','synth-parts-v1',repeat('a',64),1,'settled',420668800,238000,227,92,'synthetic');
 `);
 const tables=JSON.parse(await scalar("select json_agg(tablename order by tablename)::text from pg_tables where schemaname='public'"));
 assert.equal(tables.length,20);
 async function rows(){
  const selections=[];
  for(const table of [...tables.map(t=>'public.'+t),'private.model_trial','private.model_trial_attempts']) {
   const projection=table==='public.content_versions'?"to_jsonb(t)-array['first_result_payload','first_result_request_id','first_result_expected_version','first_result_request_digest']":"to_jsonb(t)";
   selections.push(`select ${quote(table)} as name,coalesce(jsonb_agg(${projection} order by (${projection})::text),'[]') as rows from ${table} t`);
  }return JSON.parse(await scalar(`select jsonb_object_agg(name,rows)::text from (${selections.join(' union all ')}) all_rows`));
 }
 const before=await rows();
 const securitySQL=`select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_array(p.oid,p.prosrc,p.proacl,p.proowner,p.proconfig,p.prosecdef) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),'constraints',(select jsonb_agg(jsonb_build_array(c.oid,c.conname,pg_get_constraintdef(c.oid)) order by c.oid) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')))::text`;
 const beforeSecurity=await scalar(securitySQL);
 const contextSQL="select jsonb_build_array(current_user,current_setting('role'),coalesce(current_setting('request.jwt.claim.sub',true),''),coalesce(current_setting('request.jwt.claims',true),''),current_setting('lock_timeout'))::text";
 const beforeContext=await scalar(contextSQL);
 async function noInstallation(){
  assert.equal(await scalar("select count(*)::text from pg_attribute where attrelid='public.content_versions'::regclass and attname like 'first_result_%' and not attisdropped"),'0');
  assert.equal(await scalar(securitySQL),beforeSecurity,'non-marker failure rolled back DDL and ACL');
  assert.deepEqual(await rows(),before);
  assert.equal(await scalar(contextSQL),beforeContext,'failed statement context restored');
 }
 async function rejected(sql,expected){
  await assert.rejects(()=>exec(sql),e=>{assert.match(String(e.message)+' '+String(e.stderr??''),expected);return true;});
  await noInstallation();
 }
 await rejected(candidate.replace("owner_actor constant uuid := 'e85f1a90-3565-4fc1-a7e0-3b7d08830d0e'","owner_actor constant uuid := '90000000-0000-4000-8000-000000000099'"),/PREFLIGHT_FIXED_FIXTURE_DRIFT/);
 console.log('PASS '+label+' exact actor preflight fails closed');
 await rejected(candidate.replace('-- AUTHENTICATED_FAILURE_TEST_POINT',"RAISE EXCEPTION 'FORCED_AUTH_CONTEXT_FAILURE';"),/FORCED_AUTH_CONTEXT_FAILURE/);
 console.log('PASS '+label+' error under temporary authenticated role/claims rolls back');
 await rejected(candidate.replace('-- NONMARKER_FAILURE_TEST_POINT',"RAISE EXCEPTION 'FORCED_NONMARKER_FAILURE';"),/FORCED_NONMARKER_FAILURE/);
 console.log('PASS '+label+' actual non-marker error rolls back statement DDL/ACL/test rows');
 await rejected(candidate.replace('-- PREMATURE_MARKER_TEST_POINT',"RAISE EXCEPTION USING ERRCODE='ZFR01',MESSAGE='CLOSED_PACKAGE_TESTS_COMPLETE_ROLLBACK';"),/CLOSED_PACKAGE_TESTS_COMPLETE_ROLLBACK/);
 console.log('PASS '+label+' premature marker is not swallowed');
 await rejected(candidate.replace('-- FINAL_FAILURE_TEST_POINT',"RAISE EXCEPTION 'FORCED_FINAL_FAILURE';"),/FORCED_FINAL_FAILURE/);
 console.log('PASS '+label+' failure AFTER inner rollback still rolls back outer DDL');
 // Local-only inherited privilege demonstrates why direct grants are insufficient.
 await exec('create role closed_test_inherited nologin;grant closed_test_inherited to authenticated;alter default privileges in schema private grant execute on functions to closed_test_inherited;');
 await rejected(candidate,/EFFECTIVE_EXECUTE_LEAK/);
 await exec('alter default privileges in schema private revoke execute on functions from closed_test_inherited;revoke closed_test_inherited from authenticated;');
 console.log('PASS '+label+' inherited EXECUTE leak detected, no installation');
 // Nonempty pre-existing local claims verify restoration INSIDE the DO and its
 // caller session. No real credentials or explicit outer transaction; native
 // psql executes the DO as a standalone statement in autocommit mode.
 await exec(`set lock_timeout='7s';set request.jwt.claim.sub='90000000-0000-4000-8000-000000000001';set request.jwt.claims='{"sub":"90000000-0000-4000-8000-000000000001","synthetic":true}';${candidate}
 do $verify$ begin
 if current_user<>'postgres' or current_setting('role')<>'none' or current_setting('lock_timeout')<>'7s' or current_setting('request.jwt.claim.sub')<>'90000000-0000-4000-8000-000000000001' or current_setting('request.jwt.claims')<>'{"sub":"90000000-0000-4000-8000-000000000001","synthetic":true}' then raise exception 'CALLER_CONTEXT_LEAK'; end if;
 end $verify$;reset lock_timeout;reset request.jwt.claim.sub;reset request.jwt.claims;`);
 assert.deepEqual(await rows(),before);
 assert.equal(await scalar("select count(*)::text from public.content_versions where first_result_payload is not null"),'0');
 assert.equal(await scalar("select count(*)::text from public.content_versions"),'1');
 assert.equal(await scalar("select count(*)::text from public.growth_goal_turns"),'13');
 assert.equal(await scalar("select count(*)::text from pg_attribute where attrelid='public.content_versions'::regclass and attname like 'first_result_%' and not attisdropped"),'4');
 assert.equal(await scalar("select count(*)::text from pg_constraint where conrelid='public.content_versions'::regclass and conname in ('content_versions_first_result_request_unique','content_versions_draft_shape') and convalidated"),'2');
 assert.equal(await scalar("select count(*)::text from pg_constraint where conrelid='public.content_versions'::regclass and conname='content_versions_title_check'"),'0');
 for(const signature of ['public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb)','private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'])
  for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar(`select has_function_privilege(${quote(role)},${quote(signature)},'EXECUTE')::text`),'false');
 console.log('PASS '+label+' package installed CLOSED; all 20 tables/13 history/audit/nonzero ledger unchanged; role/claims restored');
 // No migration-history contract is modeled or claimed here.
}
