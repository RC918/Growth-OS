// GSC daily labels are Pacific calendar days, never UTC-day aggregates.
// https://developers.google.com/webmaster-tools/v1/searchanalytics/query
import {checkPageCsv} from './page-observation.mjs';
import {compare} from './search-baseline.mjs';
import {canonical} from './first-result-payload.mjs';
export const GSC_TIMEZONE='America/Los_Angeles';
const clock=new Intl.DateTimeFormat('en-CA',{timeZone:GSC_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const parts=ms=>Object.fromEntries(clock.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export function pacificDate(ms){const p=parts(ms);return `${p.year}-${p.month}-${p.day}`;}
function ordinal(date){const n=Date.parse(date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==date||Number(date.slice(0,4))<2000||Number(date.slice(0,4))>2100)throw Error('GSC 日期須為 2000–2100 年有效 YYYY-MM-DD');return n;}
export function nextCalendarDate(date){return new Date(ordinal(date)+86400000).toISOString().slice(0,10);}
function midnight(date){const wall=ordinal(date);let guess=wall+8*3600000;for(let i=0;i<3;i++){const p=parts(guess),observed=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);guess+=wall-observed;}const p=parts(guess);if(pacificDate(guess)!==date||p.hour!=='00'||p.minute!=='00')throw Error('無法核對太平洋日期邊界');return guess;}
export function pacificDayBounds(date){const start=midnight(date),end=midnight(nextCalendarDate(date));return {start,end,hours:(end-start)/3600000};}
const stamp=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('時間證據需有效 ISO 日期與時區');ordinal(s.slice(0,10));return Date.parse(s);};
function propertyMatches(property,target){
 if(typeof property!=='string'||property.length>2048||property!==property.trim())throw Error('需明確 GSC property');
 if(property.startsWith('sc-domain:')){const host=property.slice(10);if(!/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(host)||host.includes('..')||(!target.hostname.endsWith('.'+host)&&target.hostname!==host))throw Error('Domain property 與頁面不吻合');}
 else {let p;try{p=new URL(property);}catch{throw Error('GSC property 格式不符');}if(!['http:','https:'].includes(p.protocol)||p.username||p.password||p.search||p.hash||p.port||p.href!==property||!target.href.startsWith(p.href))throw Error('URL-prefix property 與頁面不吻合');}
}
export function assessGscPublication(publication,data={baseline:null,followup:null},now=Date.now()){
 const e=publication?.evidence;if(!e)return {baseline:null,followup:null,comparison:null,unknown:['尚無此確切版本的核實發布證據。'],causal_claim:false,traffic_verified:false,indexing_status:'unknown'};
 if(e.scope!=='single_site_wordpress'||!['isolated_fixture','owner_site'].includes(e.environment)||e.target_url!==publication.target_url||e.page_id!==publication.page_id||canonical(e.binding)!==canonical(publication.binding))throw Error('單站發布證據綁定不符');
 if(!data||Object.keys(data).sort().join(',')!=='baseline,followup')throw Error('觀測範圍格式不符');
 const modified=stamp(e.modified_at),observed=stamp(e.observed_at);if(observed<modified)throw Error('發布時間順序不符');
 const ends=[publication.restore_started_at??publication.restore_observed_at,publication.superseded_at,publication.version_superseded_at].filter(Boolean).map(stamp),cutoff=ends.length?Math.min(...ends):null;
 const target=new URL(e.target_url),unknown=['來源與篩選仍未獨立驗真；無資料不等於未收錄，索引狀態未知。'];
 const out={baseline:null,followup:null,comparison:null,unknown,causal_claim:false,traffic_verified:false,indexing_status:'unknown',timezone:GSC_TIMEZONE};
 for(const [kind,label]of [['baseline','改善前基線'],['followup','後續觀測']]){
  const input=data[kind];if(input===null){unknown.push(label+'未知（不是零）。');continue;}
  if(!input||Object.keys(input).sort().join(',')!=='data_state,meta,property,source_name,text,timezone'||input.timezone!==GSC_TIMEZONE||input.data_state!=='final'||typeof input.source_name!=='string'||!input.source_name.trim()||input.source_name.length>200||typeof input.text!=='string')throw Error('需 GSC 原生 America/Los_Angeles 日期、final 每日資料與明確來源；不可改標 UTC');
  propertyMatches(input.property,target);stamp(input.meta?.exported);
  const p=checkPageCsv(input.text,input.meta,e.target_url,{allowEmpty:true});if(!p.applicable)throw Error(p.reason);
  const start=pacificDayBounds(p.start).start,end=pacificDayBounds(p.end).end,exported=stamp(p.exported);
  if(exported<end)throw Error(label+'：匯出早於太平洋完整日結束');
  if(kind==='baseline'&&end>modified)throw Error('基線完整日必須落在此次修改之前');
  if(kind==='followup'&&(start<observed||cutoff!==null&&end>cutoff||publication.version_cutoff_unknown||!['confirmed_applied','restored'].includes(publication.state)))throw Error('後續完整日須落在讀回後、恢復／新版本／後續發布之前');
  const simulated=end>now||exported>now;
  if(simulated&&(p.source!=='synthetic'||e.environment!=='isolated_fixture'))throw Error('未到達日期只允許隔離 synthetic 情境');
  const complete=p.complete&&p.rows.length>0;
  out[kind]={...p,complete,clicks:p.rows.length?p.clicks:null,impressions:p.rows.length?p.impressions:null,origin:target.origin,aggregation:'page_daily',source_name:input.source_name.trim(),property:input.property,data_state:'final',timezone:GSC_TIMEZONE,simulated_future:simulated,period_verified:false,window:{start:new Date(start).toISOString(),end_exclusive:new Date(end).toISOString(),hours:(end-start)/3600000}};
  if(!complete)unknown.push(label+'缺日：'+p.missing.join('、')+'；未知不填零，不能比較。');
 }
 const a=out.baseline,b=out.followup;
 if(a&&b){
  if(['source','source_name','property','timezone','data_state','type','filter'].some(k=>a[k]!==b[k]))throw Error('前後需相同來源／property／日期／搜尋類型／篩選口徑');
  if(a.end>=b.start||a.days!==b.days)throw Error('前後需等長且不重疊的原生日期期間');
  if(a.complete&&b.complete)out.comparison={...compare(a,b),provenance:a.source,scenario:a.source==='synthetic',causal_claim:false};
 }
 return out;
}
// Store only validated daily rows and their source/range declaration, not uploaded noise.
export function compactGscData(data,assessment){return Object.fromEntries(['baseline','followup'].map(kind=>{const a=assessment[kind];return [kind,a?{text:'date,clicks,impressions\n'+a.rows.map(r=>`${r.date},${r.clicks},${r.impressions}`).join('\n'),source_name:a.source_name,property:a.property,timezone:GSC_TIMEZONE,data_state:'final',meta:Object.fromEntries(['page_url','scope','source','filter','type','start','end','exported'].map(k=>[k,a[k]]))}:null];}));}
