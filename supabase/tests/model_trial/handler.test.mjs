// Offline doubles ONLY: no credentials, Supabase network or OpenAI calls.
import test from 'node:test';import assert from 'node:assert/strict';
import {createTrialHandler} from '../../functions/_shared/model-trial/handler.mjs';
import {POLICY,fixtureSnapshot,providerBody} from '../../functions/_shared/model-trial/policy.mjs';
import {supabaseAdapters,openaiProvider} from '../../functions/_shared/model-trial/adapters.mjs';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const inferred=()=>({fields:[{key:'offering',value:'合成零件',source_refs:[{turn_version:1,quote:'合成零件'}]}],missing_fields:['audience','market','channel','asset','metric']});
const result=()=>({model:POLICY.model,service_tier:'default',status:'completed',usage:{input_tokens:1000,output_tokens:100,total_tokens:1100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(inferred())}]}]});
function harness() {
 const events=[],entries=new Map();let active=null,calls=0,spent=0,held=0,paused=false,owner=true,expired=false;const warnings=[];
 const ledger={reserve:async x=>{
  events.push('reserve');if(entries.has(x.requestId))return {dispatch:false};
  if(paused||expired||active||calls+2>100||spent+held+POLICY.reserveNusd>POLICY.capNusd)throw new Error('DENIED');
  active=x.requestId;calls+=2;held+=POLICY.reserveNusd;entries.set(active,x);
  for(const threshold of [50,80])if((calls>=threshold||spent+held>=POLICY.capNusd*threshold/100)&&!warnings.includes(threshold))warnings.push(threshold);
  return {dispatch:true};
 },authorize:async()=>{events.push('authorize');if(!owner||expired)throw new Error('CHANGED');},settle:async x=>{
  events.push('settle');if(!entries.has(x.requestId)||active!==x.requestId)throw new Error('MISMATCH');
  if(x.input===null||x.output===null)paused=true;else{held-=POLICY.reserveNusd;spent+=x.input*400+x.output*1600;}
  active=null;return {calls_reserved:calls,spent_nusd:spent,held_nusd:held,warnings:[...warnings],state:paused?'paused':'active'};
 }};
 const provider={count:async payload=>{events.push('count');return 1000;},generate:async payload=>{events.push('generate');return result();}};
 const authenticate=async()=>owner?{id:actor,role:'owner'}:null;
 const create=options=>createTrialHandler({authenticate,ledger,provider,ready:true,...options});
 const request=(n=1,extra={})=>new Request('https://synthetic.test/trial',{method:'POST',headers:{Authorization:'Bearer offline-test-double'},body:JSON.stringify({request_id:id(n),organization_id:org,fixture_id:'synth-parts-v1',expected_version:1,...extra})});
 return {events,ledger,provider,create,request,get state(){return {calls,spent,held,paused,active};},revoke:()=>owner=false,expire:()=>expired=true};
}
test('staged runtime, anon/viewer, arbitrary prompt/operation and stale input never reserve or call provider',async()=>{
 const h=harness();assert.equal((await h.create({ready:false})(h.request())).status,503);
 assert.equal((await h.create({authenticate:async()=>null})(h.request())).status,403);
 assert.equal((await h.create({authenticate:async()=>({id:actor,role:'viewer'})})(h.request())).status,403);
 for(const extra of [{prompt:'customer text'},{operation:'publish'},{fixture_id:'real-goal'},{expected_version:2}])assert.equal((await h.create()(h.request(1,extra))).status,503);
 assert.deepEqual(h.events,[]);
});
test('reservation commits before both calls; synthetic-only payload omits identity and intent remains unconfirmed/nonpersistent',async()=>{
 const h=harness();h.provider.count=async body=>{h.events.push('count');const wire=JSON.stringify(body);for(const forbidden of [actor,org,'offline-test-double','aaaaaaaa-aaaa'])assert.ok(!wire.includes(forbidden));assert.equal(body.store,false);assert.equal(body.max_output_tokens,1024);assert.equal(body.model,POLICY.model);assert.ok(!Object.hasOwn(body,'tools'));return 1000;};
 const reply=await h.create()(h.request());const body=await reply.json();assert.equal(reply.status,200);assert.equal(body.can_persist,false);assert.equal(body.proposal.status,'awaiting_user_confirmation');assert.equal(body.proposal.inference_verified,false);assert.equal(reply.headers.get('cache-control'),'no-store');assert.deepEqual(h.events,['reserve','authorize','count','authorize','generate','settle']);assert.equal(h.state.spent,560000);assert.equal(h.state.held,0);
});
test('two handler instances sharing ledger: 24 concurrent attempts dispatch exactly one',async()=>{
 const h=harness();let release;const gate=new Promise(r=>release=r);h.provider.count=async()=>{h.events.push('count');await gate;return 1000;};
 const first=h.create()(h.request());while(!h.events.includes('count'))await Promise.resolve();
 const replies=await Promise.all(Array.from({length:23},(_,i)=>h.create()(h.request(i+2))));assert.ok(replies.every(r=>r.status===503));assert.equal(h.state.calls,2);release();assert.equal((await first).status,200);assert.equal(h.events.filter(e=>e==='generate').length,1);
});
test('request replay never calls model twice; calls cap and 50/80 warnings survive across instances',async()=>{
 const h=harness();assert.equal((await h.create()(h.request())).status,200);assert.equal((await h.create()(h.request())).status,409);
 for(let n=2;n<=50;n++){const reply=await h.create()(h.request(n));assert.equal(reply.status,200);if(n===25||n===40)assert.ok((await reply.json()).accounting.warnings.includes(n===25?50:80));}
 assert.equal(h.state.calls,100);assert.equal((await h.create()(h.request(51))).status,503);assert.equal(h.events.filter(e=>e==='generate').length,50);
});
test('owner/deadline changing after count stops generation and keeps worst-case reservation paused',async()=>{
 for(const change of ['revoke','expire']){const h=harness();h.provider.count=async()=>{h.events.push('count');h[change]();return 1000;};assert.equal((await h.create()(h.request())).status,503);assert.ok(!h.events.includes('generate'));assert.equal(h.state.paused,true);assert.equal(h.state.held,POLICY.reserveNusd);}
});
test('count over limit, provider timeout/unknown usage/mismatch/tier: no refund, no retry or new calls',async()=>{
 for(const mode of ['count','timeout','missing','mismatch','tier']){const h=harness();
 if(mode==='count')h.provider.count=async()=>2049;
 else h.provider.generate=async()=>{if(mode==='timeout')throw new Error('raw provider error must not leak');const r=result();if(mode==='missing')delete r.usage;if(mode==='mismatch')r.usage.input_tokens=999;if(mode==='tier')r.service_tier='priority';return r;};
 const reply=await h.create()(h.request());assert.equal(reply.status,503);assert.ok(!(await reply.text()).includes('raw provider'));assert.equal(h.state.paused,true);assert.equal(h.state.held,POLICY.reserveNusd);assert.equal((await h.create()(h.request(2))).status,503);if(mode==='count')assert.ok(!h.events.includes('generate'));
 }
});
test('known-usage refusal/truncation/invalid source or privileged output is charged but never yields proposal',async()=>{
 for(const mode of ['refusal','incomplete','source','operation']){const h=harness();h.provider.generate=async()=>{const r=result();if(mode==='refusal')r.output[0].content=[{type:'refusal',refusal:'synthetic'}];if(mode==='incomplete')r.status='incomplete';if(mode==='source')r.output[0].content[0].text=JSON.stringify({...inferred(),fields:[{...inferred().fields[0],source_refs:[{turn_version:1,quote:'fabricated'}]}]});if(mode==='operation')r.output[0].content[0].text=JSON.stringify({...inferred(),operation:'save'});return r;};
 const reply=await h.create()(h.request());assert.equal(reply.status,503);assert.ok(!Object.hasOwn(await reply.json(),'proposal'));assert.equal(h.state.spent,560000);assert.equal(h.state.held,0);
 }
});
test('post-provider revocation or source/version change denies proposal, while confirmed usage stays charged',async()=>{
 for(const mode of ['owner','version']){const h=harness();let changed=false;h.provider.generate=async()=>{changed=true;if(mode==='owner')h.revoke();return result();};
 const options=mode==='version'?{getSnapshot:(...args)=>{const s=fixtureSnapshot(...args);if(changed)s.turns[0].answer_text+='changed';return s;}}:{};
 assert.equal((await h.create(options)(h.request())).status,503);assert.equal(h.state.spent,560000);assert.equal(h.state.held,0);}
});
test('ledger settlement outage keeps reservation and suppresses proposal; pre-reserve ledger failure never external-calls',async()=>{
 const h=harness();h.ledger.settle=async()=>{throw new Error('unavailable');};const reply=await h.create()(h.request());assert.equal(reply.status,503);assert.equal((await reply.json()).code,'LEDGER_UNCONFIRMED_STOP');assert.equal(h.state.held,POLICY.reserveNusd);assert.equal((await h.create()(h.request(2))).status,503);
 const pre=harness();pre.ledger.reserve=async()=>{throw new Error('unavailable');};assert.equal((await pre.create()(pre.request())).status,503);assert.ok(!pre.events.includes('count'));
});
test('real transport code tested with fake fetch: fixed count/schema, max-output, no raw provider body in errors',async()=>{
 const calls=[];const provider=openaiProvider({getKey:()=> 'offline-double-not-a-key',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('input_tokens')?{object:'response.input_tokens',input_tokens:1000}:result());}});
 const payload=providerBody(fixtureSnapshot('synth-parts-v1',org));assert.equal(await provider.count(payload),1000);await provider.generate(payload);assert.equal(calls.length,2);assert.equal(JSON.parse(calls[0].options.body).text.format.type,'json_schema');assert.equal(calls[1].options.redirect,'error');assert.ok(!Object.hasOwn(JSON.parse(calls[1].options.body),'previous_response_id'));
 const denied=openaiProvider({getKey:()=> 'offline-double-not-a-key',fetchImpl:async()=>new Response('do not echo credential',{status:401})});await assert.rejects(()=>denied.count(payload),e=>e.message==='UPSTREAM_REJECTED');
});
test('Supabase auth is user-scoped; only ledger RPC gets service credential, both remain outside provider',async()=>{
 const calls=[];const a=supabaseAdapters({publishableKey:'synthetic-public',serviceKey:'synthetic-service',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/auth/v1/user')?{id:actor}:url.includes('organization_members')?[{user_id:actor,organization_id:org,role:'owner'}]:{dispatch:true});}});
 const request=harness().request();assert.equal((await a.authenticate(request,org)).id,actor);await a.ledger.reserve({requestId:id(1),actorId:actor,organizationId:org,fixtureId:'synth-parts-v1',hash:'a'.repeat(64),expectedVersion:1});
 assert.equal(calls[0].options.headers.apikey,'synthetic-public');assert.equal(calls[1].options.headers.Authorization,'Bearer offline-test-double');assert.equal(calls[2].options.headers.apikey,'synthetic-service');assert.ok(calls.every(c=>c.url.startsWith('https://vhzryhibmpvglzcmfnaa.supabase.co/')));
});
