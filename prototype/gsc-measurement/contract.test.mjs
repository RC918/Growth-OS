import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGscPublication as assess,pacificDayBounds,pacificDate,GSC_TIMEZONE,compactGscData} from '../../apps/web/gsc-date-contract.mjs';
import {assessPublication} from '../../apps/web/publication-measurement.mjs';
const target='https://site.example/growth-os/';
const binding={organization_id:'org',version_id:'v1',review_id:'r1'};
const publication=()=>({id:'p1',binding,page_id:1001,target_url:target,state:'confirmed_applied',evidence:{binding,scope:'single_site_wordpress',environment:'isolated_fixture',page_id:1001,target_url:target,modified_at:'2026-03-09T07:00:00Z',observed_at:'2026-03-09T07:00:00Z'}});
function input(start,end=start,rows=null){return {text:'date,clicks,impressions\n'+(rows??`${start},0,0`),source_name:'Synthetic GSC-style fixture',property:'sc-domain:site.example',timezone:GSC_TIMEZONE,data_state:'final',meta:{page_url:target,scope:'page',source:'synthetic',type:'web',filter:'page equals '+target+'; country/device all',start,end,exported:'2026-04-01T00:00:00Z'}};}
const data=()=>({baseline:input('2026-03-08'),followup:input('2026-03-09')});
test('Pacific labels retain 23/25-hour days and UTC boundaries without splitting totals',()=>{
 const spring=pacificDayBounds('2026-03-08'),fall=pacificDayBounds('2026-11-01');assert.equal(spring.hours,23);assert.equal(fall.hours,25);assert.equal(new Date(spring.start).toISOString(),'2026-03-08T08:00:00.000Z');assert.equal(new Date(spring.end).toISOString(),'2026-03-09T07:00:00.000Z');assert.equal(new Date(fall.start).toISOString(),'2026-11-01T07:00:00.000Z');assert.equal(new Date(fall.end).toISOString(),'2026-11-02T08:00:00.000Z');
 assert.equal(pacificDate(Date.parse('2026-03-09T06:59:59Z')),'2026-03-08');for(const d of ['2026-02-30','2026-13-01','2026-3-8','not-a-date'])assert.throws(()=>pacificDayBounds(d));
 const out=assessPublication(publication(),data(),Date.parse('2026-04-02T00:00:00Z'));assert.equal(out.baseline.rows[0].date,'2026-03-08');assert.equal(out.baseline.window.hours,23);assert.equal(out.followup.window.hours,24);assert.equal(out.comparison.clickDifference,0);assert.equal(out.traffic_verified,false);assert.equal(out.comparison.scenario,true);
});
test('baseline before modification, followup after readback, restore/new-version cutoffs are exact instants',()=>{
 const p=publication(),d=data();assert.ok(assess(p,d).comparison);p.evidence.modified_at='2026-03-09T06:59:59.999Z';assert.throws(()=>assess(p,d),/基線/);p.evidence.modified_at='2026-03-09T07:00:00Z';p.evidence.observed_at='2026-03-09T07:00:00.001Z';assert.throws(()=>assess(p,d),/後續/);p.evidence.observed_at=p.evidence.modified_at;
 for(const key of ['restore_started_at','superseded_at','version_superseded_at']){p[key]='2026-03-10T07:00:00Z';assert.ok(assess(p,d).comparison);p[key]='2026-03-10T06:59:59.999Z';assert.throws(()=>assess(p,d),/後續/);delete p[key];}
 p.version_cutoff_unknown=true;assert.throws(()=>assess(p,d),/後續/);delete p.version_cutoff_unknown;p.state='restore_unknown';assert.throws(()=>assess(p,d),/後續/);
 const fall=publication();fall.evidence.modified_at=fall.evidence.observed_at='2026-11-02T08:00:00Z';const f={baseline:input('2026-11-01'),followup:null};f.baseline.meta.exported='2026-11-03T00:00:00Z';assert.equal(assess(fall,f).baseline.window.hours,25);
});
test('missing days and no rows remain unknown; explicit zero is data, not indexing evidence',()=>{
 const p=publication(),d={baseline:input('2026-03-07','2026-03-08','2026-03-07,0,0'),followup:input('2026-03-09','2026-03-10','2026-03-09,0,0\n2026-03-10,0,0')};let a=assess(p,d);assert.equal(a.comparison,null);assert.equal(a.baseline.clicks,0);assert.deepEqual(a.baseline.missing,['2026-03-08']);
 d.baseline.text='date,clicks,impressions\n';a=assess(p,d);assert.equal(a.baseline.clicks,null);assert.equal(a.baseline.impressions,null);assert.equal(a.indexing_status,'unknown');assert.equal(a.comparison,null);assert.equal(assess(p,{baseline:null,followup:null}).baseline,null);
});
test('exact source/property/page/filter/type, equal nonoverlapping periods and provenance are enforced',()=>{
 for(const change of [d=>d.followup.property='https://site.example/',d=>d.followup.source_name='different',d=>d.followup.meta.filter='other',d=>d.followup.meta.type='image',d=>d.followup.meta.source='provider_asserted',d=>d.baseline.timezone='UTC',d=>d.baseline.data_state='all',d=>d.baseline.meta.source='verified',d=>d.baseline.meta.page_url=target+'other',d=>d.baseline.property='sc-domain:other.example',d=>d.baseline.property='https://site.example/other/',d=>d.baseline.secret='reject']){const d=data();change(d);assert.throws(()=>assess(publication(),d));}
 const d=data();d.followup.meta.end='2026-03-10';assert.throws(()=>assess(publication(),d),/等長/);
 for(const property of ['https://site.example/','https://site.example/growth-os/','sc-domain:site.example']){const v=data();v.baseline.property=v.followup.property=property;assert.ok(assess(publication(),v).comparison);}
 const provider=data();for(const v of Object.values(provider))v.meta.source='provider_asserted';const a=assess(publication(),provider,Date.parse('2026-04-02T00:00:00Z'));assert.equal(a.traffic_verified,false);assert.equal(a.comparison.scenario,false);assert.equal(a.comparison.provenance,'provider_asserted');assert.throws(()=>assess(publication(),provider,Date.parse('2026-03-09T00:00:00Z')),/未到達/);
});
test('export completion, receipt environment/binding, future data and compact persistence fail closed',()=>{
 let p=publication(),d=data();d.baseline.meta.exported='2026-03-09T06:59:59Z';assert.throws(()=>assess(p,d),/匯出/);d=data();p.evidence.environment='owner_site';assert.throws(()=>assess(p,d,Date.parse('2026-03-09T00:00:00Z')),/未到達/);p=publication();p.evidence={...p.evidence,binding:{...binding,version_id:'wrong'}};assert.throws(()=>assess(p,d),/綁定/);
 p=publication();d.baseline.text+='\n\n';const a=assess(p,d),compact=compactGscData(d,a);assert.equal(compact.baseline.text,'date,clicks,impressions\n2026-03-08,0,0');assert.deepEqual(assess(p,compact),a);assert.equal(assess(p,d,Date.parse('2026-03-09T00:00:00Z')).followup.simulated_future,true);
});
