// Local handler -> exact SQL migration. Auth/provider are explicit doubles.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createTrialHandler} from '../../functions/_shared/model-trial/handler.mjs';
import {POLICY} from '../../functions/_shared/model-trial/policy.mjs';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
const db=await PGlite.create();
try {
 await db.exec(`create schema auth;create schema private;create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create table auth.users(id uuid primary key);create table organizations(id uuid primary key);create table organization_members(organization_id uuid,user_id uuid,role text);
 insert into auth.users values('${actor}');insert into organizations values('${org}');insert into organization_members values('${org}','${actor}','owner');`);
 await db.exec(await readFile(new URL('../../migrations/20261001083611_growth_model_trial_budget.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../migrations/20261001120704_growth_model_trial_bounded_deadline.sql',import.meta.url),'utf8'));
 let activation=await readFile(new URL('activate.sql.template',import.meta.url),'utf8');
 for(const [key,value] of Object.entries({__READY_POLICY__:POLICY.version,__RUNTIME_REVIEWED__:'confirmed',__ACTOR_UUID__:actor,__ORG_UUID__:org}))activation=activation.replaceAll(key,value);
 // Offline copy only: production human cutoff is never changed by this harness.
 activation=activation.replace("TIMESTAMPTZ '2026-10-07T11:50:00Z'","clock_timestamp()+interval '3 days'");
 await db.exec(activation);await db.exec('set role service_role');
 const invoke=async(sql,args)=>(await db.query(sql,args)).rows[0].r;
 const ledger={reserve:x=>invoke('select public.model_trial_reserve($1,$2,$3,$4,$5,$6) r',[x.requestId,x.actorId,x.organizationId,x.fixtureId,x.hash,x.expectedVersion]),
 authorize:x=>invoke('select public.model_trial_authorize_dispatch($1,$2,$3) r',[x.requestId,x.actorId,x.organizationId]),
 settle:x=>invoke('select public.model_trial_settle($1,$2,$3,$4) r',[x.requestId,x.input,x.output,x.result])};
 let generated=0;
 const provider={generate:async()=>{generated++;return {model:POLICY.model,service_tier:'default',status:'completed',usage:{input_tokens:1000,output_tokens:100,total_tokens:1100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({fields:[],missing_fields:['offering','audience','market','channel','asset','metric']})}]}]};}};
 const handler=createTrialHandler({authenticate:async()=>({id:actor,role:'owner'}),ledger,provider,ready:true});
 const request=n=>new Request('https://synthetic.test',{method:'POST',body:JSON.stringify({request_id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`,organization_id:org,fixture_id:'synth-parts-v1',expected_version:1})});
 assert.equal((await handler(request(1))).status,200);assert.equal((await handler(request(1))).status,409);assert.equal(generated,1);
 await db.exec('reset role');let row=(await db.query('select calls_reserved,spent_nusd::text,held_nusd::text from private.model_trial')).rows[0];
 assert.deepEqual(row,{calls_reserved:2,spent_nusd:'560000',held_nusd:'0'});
 console.log('PASS INTEGRATION real SQL accounting and replay, provider/Auth doubles');
 await db.exec('set role service_role');provider.generate=async()=>{throw new Error('synthetic timeout');};
 assert.equal((await handler(request(2))).status,503);assert.equal((await handler(request(3))).status,503);
 await db.exec('reset role');row=(await db.query('select state,calls_reserved,held_nusd::text from private.model_trial')).rows[0];
 assert.deepEqual(row,{state:'paused',calls_reserved:4,held_nusd:'420668800'});
 console.log('PASS INTEGRATION timeout preserves persistent budget and blocks next request');
} finally {await db.close();}
