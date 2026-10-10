import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
import {fixture,ids} from './r7-save-fixture.mjs';
const frame=JSON.parse(await readFile('apps/web/intro-r7.json','utf8'));
const fragment=t=>'#access_token='+t+'&token_type=bearer&expires_in=3600';
const client=(f,enabled=true,origin='https://wqepyttadrcnphtyjpjy.supabase.co')=>createWorkspaceApi({origin,key:'sb_publishable_fixture',redirectOrigin:'https://example.test',introSaveEnabled:enabled,fetchImpl:f.fetchImpl});
test('closed gate, old project and viewer cannot dispatch R7 writes',async()=>{
 for(const [enabled,origin,token] of [[false,undefined,'a'],[true,'https://vhzryhibmpvglzcmfnaa.supabase.co','a'],[true,undefined,'viewer']]){
 const f=fixture(),a=client(f,enabled,origin);await a.completeMagicLink(fragment(token));await assert.rejects(a.intro.save(frame,null));assert.equal(f.audit.length,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);}
});
test('exact frame -> save -> confirm -> independent login readback; other tenant isolated',async()=>{
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));let row=await a.intro.save(frame,null);assert.deepEqual(row.frame,frame);assert.equal(row.confirmation,null);row=await a.intro.confirm(row);assert.equal(row.confirmation.actor_id,ids.owner);assert.equal(f.audit.length,2);
 a.signOut();await assert.rejects(a.intro.read());const fresh=client(f);await fresh.completeMagicLink(fragment('a'));assert.deepEqual(await fresh.intro.read(),row);
 const b=client(f);await b.completeMagicLink(fragment('b'));assert.equal(await b.intro.read(),null);await assert.rejects(b.intro.confirm(row));assert.equal(f.audit.length,2);
 const response=await f.fetchImpl('https://fixture/rest/v1/intro_versions?organization_id=eq.'+ids.org,{method:'GET',headers:{Authorization:'Bearer b'}});assert.equal(response.status,403);
});
test('new version clears approval; stale version and tampered R7 fail before write',async()=>{
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));const first=await a.intro.save(frame,null),confirmed=await a.intro.confirm(first);const second=await a.intro.save(frame,confirmed);assert.equal(second.version,2);assert.equal(second.confirmation,null);await assert.rejects(a.intro.confirm(first),/版本已改變/);
 const wrong=structuredClone(frame);wrong.payload.candidate.output.candidate+=' altered';await assert.rejects(a.intro.save(wrong,second));assert.equal(f.audit.length,3);
});
test('lost save/confirm response reconciles original request, never retries POST',async()=>{
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));f.loseNext();await assert.rejects(a.intro.save(frame,null),/結果未知/);await assert.rejects(a.intro.save(frame,null),/只可/);const row=await a.intro.reconcile();assert.equal(f.audit.length,1);
 f.loseNext();await assert.rejects(a.intro.confirm(row),/結果未知/);await assert.rejects(a.intro.confirm(row),/只可/);assert.ok((await a.intro.reconcile()).confirmation);assert.equal(f.audit.length,2);
});
test('corrupt readback and logout during read fail closed',async()=>{
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));await a.intro.save(frame,null);f.corrupt(true);await assert.rejects(a.intro.read(),/核對失敗/);f.corrupt(false);
 let release;f.hold(new Promise(r=>release=r));const pending=a.intro.read();a.signOut();await a.completeMagicLink(fragment('a'));release();await assert.rejects(pending,/工作階段/);
});
test('two clients racing the same base cannot create two first versions',async()=>{
 const f=fixture(),a=client(f),b=client(f);await a.completeMagicLink(fragment('a'));await b.completeMagicLink(fragment('a'));
 const results=await Promise.allSettled([a.intro.save(frame,null),b.intro.save(frame,null)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.versions.length,1);assert.equal(f.audit.length,1);
});
test('invalidated UI intent never dispatches after asynchronous validation',async()=>{
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));
 await assert.rejects(a.intro.save(frame,null,{isCurrent:()=>false}),/意圖已失效/);assert.equal(f.audit.length,0);
});
test('unknown save rejects changed version/frame/identity and remains blocked',async()=>{
 for(const patch of [r=>r.version=99,r=>r.created_by=ids.other,r=>r.request_id=crypto.randomUUID(),r=>r.frame.payload.candidate.output.candidate+=' altered',r=>r.source_version='0'.repeat(64)]){
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));f.loseNext();await assert.rejects(a.intro.save(frame,null));patch(f.versions[0]);await assert.rejects(a.intro.reconcile());await assert.rejects(a.intro.save(frame,null),/只可/);assert.equal(f.audit.length,1);
 }
});
test('unknown confirmation binds full saved version and original confirmation actor/request',async()=>{
 for(const patch of [r=>{r.version=99;r.confirmation.version=99;},r=>{r.id=crypto.randomUUID();r.confirmation.version_id=r.id;},r=>r.created_at='2027-01-01T00:00:00Z',r=>r.confirmation.actor_id=ids.other,r=>r.confirmation.request_id=crypto.randomUUID()]){
 const f=fixture(),a=client(f);await a.completeMagicLink(fragment('a'));const row=await a.intro.save(frame,null);f.loseNext();await assert.rejects(a.intro.confirm(row));patch(f.versions[0]);await assert.rejects(a.intro.reconcile());await assert.rejects(a.intro.confirm(row),/只可/);assert.equal(f.audit.length,2);
 }
});
