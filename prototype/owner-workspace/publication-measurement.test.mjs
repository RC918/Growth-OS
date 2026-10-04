import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {assessPublication,publicationMeasurement} from './publication-measurement.mjs';
const p={id:'publication',state:'confirmed_applied',page_id:4,target_url:'https://127.0.0.1:444/bolt/',evidence:{scope:'isolated_wordpress',page_id:4,target_url:'https://127.0.0.1:444/bolt/',first_published_at:'2026-01-01T00:00:00Z',modified_at:'2026-10-04T10:00:00Z',observed_at:'2026-10-04T10:00:01Z'}};
const data=()=>Object.fromEntries([['baseline',[2,3]],['followup',[5,6]]].map(([k,days])=>[k,{source_name:'synthetic-fixture',timezone:'UTC',text:'date,clicks,impressions\n'+days.map(d=>`2026-10-0${d},0,0`).join('\n'),meta:{page_url:p.target_url,scope:'page',source:'synthetic',filter:'all devices',type:'web',start:`2026-10-0${days[0]}`,end:`2026-10-0${days[1]}`,exported:'2026-10-07T00:00:00Z'}}]));
test('binds UTC full days to this modification/readback, not original publication; zero differs from missing/unknown',()=>{
 const out=assessPublication(p,data(),Date.parse('2026-10-04T12:00:00Z'));assert.equal(out.baseline.clicks,0);assert.equal(out.baseline.ctr,null);assert.equal(out.followup.simulated_future,true);assert.equal(out.comparison.clickDifference,0);assert.equal(out.comparison.scenario,true);assert.equal(out.traffic_verified,false);assert.equal(out.causal_claim,false);
 const d=data();d.baseline.text='date,clicks,impressions\n2026-10-02,0,0';assert.equal(assessPublication(p,d).comparison,null);assert.deepEqual(assessPublication(p,d).baseline.missing,['2026-10-03']);assert.equal(assessPublication(p).baseline,null);
});
test('wrong page/port, site scope, provenance upgrade, mixed source/type/filter and invalid temporal windows reject',()=>{
 const mutate=[d=>d.followup.source_name='other-provider',d=>d.followup.timezone='America/Los_Angeles',d=>d.baseline.meta.page_url='https://127.0.0.1:445/bolt/',d=>d.baseline.meta.scope='site',d=>d.baseline.meta.source='verified',d=>d.followup.meta.type='image',d=>d.followup.meta.filter='different device',d=>d.followup.meta.source='provider_asserted',d=>d.followup.meta.exported='2026-10-05T00:00:00Z',d=>{d.baseline.text='date,clicks,impressions\n2026-10-04,0,0';d.baseline.meta.start=d.baseline.meta.end='2026-10-04';},d=>{d.followup.text='date,clicks,impressions\n2026-10-04,0,0';d.followup.meta.start=d.followup.meta.end='2026-10-04';}];
 for(const change of mutate){const d=data();change(d);assert.throws(()=>assessPublication(p,d,Date.parse('2026-10-04T12:00:00Z')));}
});
test('restored and restore-unknown cannot treat post-restore days as improvement exposure',()=>{
 assert.throws(()=>assessPublication({...p,superseded_at:'2026-10-05T12:00:00Z'},data()));
 for(const state of ['restored','restore_unknown'])assert.throws(()=>assessPublication({...p,state,restore_started_at:'2026-10-04T11:00:00Z',restore_observed_at:'2026-10-04T11:00:01Z'},data()));
 assert.equal(assessPublication({...p,state:'restored',restore_started_at:'2026-10-07T00:00:00Z'},data()).comparison.clickDifference,0);
});
test('late session, detached panel and editing cannot repaint saved observations',async()=>{
 const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
 try{for(const mode of ['session','detach','edit']){let session={role:'owner'},release;const api={context:()=>session,readPublicationMeasurement:()=>new Promise(r=>release=r)};const panel=publicationMeasurement({api,version:{id:'v1',version_number:1},latest:true,isCurrent:()=>true});document.querySelector('main').replaceChildren(panel.root);panel.root.querySelector('.measurement-read').click();if(mode==='session')session={role:'owner'};if(mode==='detach')panel.root.remove();if(mode==='edit')panel.setEditing(true);release({position:'latest_at_read',publication:p,publications:[p],assessment:assessPublication(p,data())});await new Promise(r=>setTimeout(r,0));assert.equal(panel.root.querySelector('.measurement-body').textContent,'');}}
 finally{delete globalThis.document;dom.window.close();}
});
