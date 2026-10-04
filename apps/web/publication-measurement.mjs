import {checkPageCsv} from './page-observation.mjs';
import {compare} from './search-baseline.mjs';
const DAY=86400000;
const stamp=value=>{const n=Date.parse(value);if(!Number.isFinite(n))throw Error('發布時間證據不完整');return n;};
// Publication authority is server-read; CSV provenance remains caller-declared.
export function assessPublication(publication,data={baseline:null,followup:null},now=Date.now()){
 const evidence=publication?.evidence;
 if(!evidence)return {baseline:null,followup:null,comparison:null,unknown:['尚無此確切版本的核實發布證據。'],causal_claim:false};
 if(evidence.scope!=='isolated_wordpress'||evidence.target_url!==publication.target_url||evidence.page_id!==publication.page_id)throw Error('發布頁面證據不一致');
 const modified=stamp(evidence.modified_at),observed=stamp(evidence.observed_at);if(observed<modified)throw Error('發布時間順序不符');
 const ends=[publication.restore_started_at??publication.restore_observed_at,publication.superseded_at].filter(Boolean).map(stamp),cutoff=ends.length?Math.min(...ends):null;
 const unknown=[],out={baseline:null,followup:null,comparison:null,unknown,causal_claim:false,traffic_verified:false};
 for(const [kind,label]of [['baseline','改善前基線'],['followup','後續觀測']]){
  const input=data?.[kind];if(!input){unknown.push(label+'未知（不是零）。');continue;}
  if(typeof input.source_name!=='string'||!input.source_name.trim()||input.source_name.length>200||input.timezone!=='UTC')throw Error(label+'：需明確資料來源名稱與 UTC 完整日口徑；不自動轉換時區。');
  const meta=input.meta;
  const target=new URL(evidence.target_url),local=evidence.scope==='isolated_wordpress'&&target.hostname==='127.0.0.1';
  const p=checkPageCsv(input.text,meta,evidence.target_url,{localWordpress:local});
  if(!p.applicable)throw Error(label+'：'+p.reason);
  const start=stamp(p.start+'T00:00:00Z'),end=stamp(p.end+'T00:00:00Z')+DAY,exported=stamp(p.exported);
  if(exported<end)throw Error(label+'：匯出時間早於完整觀測日結束。');
  if(kind==='baseline'&&end>modified)throw Error('基線必須完整落在本次修改之前；不能用首次發布時間替代。');
  if(kind==='followup'&&(start<observed||(cutoff!==null&&end>cutoff)||!['confirmed_applied','restored'].includes(publication.state)))throw Error('後續期間不在本次核實修改後、恢復／後續發布開始前的完整日區間。');
  const simulated=exported>now||end>now;
  if(simulated&&p.source!=='synthetic')throw Error('提供者聲明資料不可來自未到達的日期／匯出時間。');
  out[kind]={...p,origin:target.origin,aggregation:'page_daily',source_name:input.source_name.trim(),timezone:input.timezone,simulated_future:simulated,period_verified:false};
  if(!p.complete)unknown.push(label+'缺日：'+p.missing.join('、')+'；缺日不填零，不能比較。');
 }
 const a=out.baseline,b=out.followup;
 if(a&&b){
  if(a.source!==b.source||a.source_name!==b.source_name||a.timezone!==b.timezone||a.type!==b.type||a.filter!==b.filter)throw Error('前後資料須為相同來源聲明、搜尋類型及篩選口徑；訪問量不能混為搜尋點擊。');
  if(a.complete&&b.complete){out.comparison={...compare(a,b),provenance:a.source,scenario:a.source==='synthetic',causal_claim:false};}
 }
 return out;
}

export function publicationMeasurement({api,version,isCurrent,latest=false}){
 const root=document.createElement('section');root.className='measurement-preparation publication-measurement';
 const add=(parent,tag,text,cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;parent.append(n);return n;};
 add(root,'h4','此版本的發布與量測');add(root,'p','發布證據來自本 run 的受控站紀錄；搜尋資料仍是合成情境或提供者聲明。沒有資料就是未知，差異不代表因果。');
 const read=add(root,'button','讀取此版本量測','measurement-read');read.type='button';const status=add(root,'p','','measurement-status');status.role='status';
 const body=add(root,'div','','measurement-body'),form=add(root,'form','','publication-measurement-form');form.hidden=true;
 const controls={};
 function field(parent,key,label,type='text',options=null){const wrap=add(parent,'label',label),n=add(wrap,options?'select':'input','');n.className='measure-'+key;n.name=key;if(!options)n.type=type;if(options)for(const [value,text]of options){const o=add(n,'option',text);o.value=value;}controls[key]=n;return n;}
 const chosen=field(form,'publication','發布紀錄','text',[]);
 const source=field(form,'source','資料来源','text',[['synthetic','合成情境（非真流量）'],['provider_asserted','提供者聲明（未獨立驗真）']]);
 field(form,'source_name','資料來源名稱（合成 fixture／提供者名稱，仍未驗真）');field(form,'timezone','日期口徑','text',[['UTC','UTC 完整日；其他時區須先處理，系統不代換']]);
 field(form,'type','搜尋類型','text',[['web','網頁搜尋'],['image','圖片搜尋'],['video','影片搜尋'],['news','新聞搜尋']]);
 field(form,'page_url','CSV 篩選的完整頁面 URL','url');field(form,'filter','其他匯出篩選條件（前後必須一致）');
 for(const [kind,label]of [['baseline','改善前基線'],['followup','後續觀測']]){const box=add(form,'fieldset','');add(box,'legend',label+'（可不提供）');field(box,kind+'-file','每日 CSV','file').accept='.csv,text/csv';field(box,kind+'-start','開始日','date');field(box,kind+'-end','結束日','date');field(box,kind+'-exported','匯出時間（含時區）');}
 const save=add(form,'button','核對並保存此版本觀測','measure-save');save.type='submit';
 add(root,'p','僅保存在本 run journal；同一 run 的發布服務 process 重啟後，重新驗證 session 與原有效授權才能讀回；run／執行端結束後不保留。沒有新增平台權限。');
 const session=api.context();let epoch=0,busy=false,editing=false,value=null;
 const active=n=>root.isConnected&&isCurrent()&&api.context()===session&&!editing&&epoch===n;
 function paint(){read.disabled=busy||editing;for(const input of form.querySelectorAll('input,select,button'))input.disabled=busy||editing;}
 function render(v){value=v;body.replaceChildren();form.hidden=!v.publication;const p=v.publication;
  add(body,'p',`${v.position==='historical'?'歷史':'讀取時最新'}第 ${version.version_number} 版 · ${version.id}`,'measurement-version');
  if(!p){add(body,'p','尚無此版本發布證據；基線／後續／成效未知（不是零）。','measurement-outcome');return;}
  add(body,'p',`頁面：${p.target_url} · 發布紀錄 ${p.id}`,'measurement-target');
  add(body,'p',`受控發布已核對；${p.state==='restored'?'已恢復發布前內容':p.state==='confirmed_applied'?'記錄為已套用（非即時網站狀態）':'狀態 '+p.state}`,'measurement-publication');
  add(body,'p',`首次發布（平台紀錄）：${p.evidence.first_published_at}；此次修改：${p.evidence.modified_at}；讀回：${p.evidence.observed_at}；恢復開始：${p.restore_started_at??'無'}；恢復讀回：${p.restore_observed_at??'無'}；後續同頁發布：${p.superseded_at??'無'}`,'measurement-times');
  chosen.replaceChildren();for(const item of v.publications){const o=add(chosen,'option',`${item.evidence.modified_at} · ${item.state} · ${item.id}`);o.value=item.id;}chosen.value=p.id;
  controls.page_url.value=p.target_url;
  const a=v.assessment;
  for(const [kind,label]of [['baseline','改善前基線'],['followup','後續觀測']]){const d=a[kind],box=add(body,'section','','measure-'+kind+'-result');add(box,'h5',label);if(!d){add(box,'p','未知（不是零）');continue;}add(box,'p',`${d.source==='synthetic'?'合成情境，非真流量':'提供者聲明，未獨立驗真'} · ${d.type} · ${d.start} 至 ${d.end} · ${d.simulated_future?'未來合成日期，未實際觀察':'期間聲明未獨立驗真'}`);add(box,'p',`來源：${d.source_name} · 日期口徑：${d.timezone}`);add(box,'p',`匯出：${d.exported} · 篩選：${d.filter}`);add(box,'p',`覆蓋 ${d.rows.length}/${d.days} 天；缺日：${d.missing.join('、')||'無'}；已提供日期點擊 ${d.clicks}、曝光 ${d.impressions}；CTR ${d.ctr===null?'未知（曝光為零）':(d.ctr*100).toFixed(2)+'%'}`);}
  add(body,'p',a.comparison?`${a.comparison.scenario?'合成情境差異':'聲明觀察差異'}：點擊 ${a.comparison.clickDifference}、曝光 ${a.comparison.impressionDifference}。不是成長因果，真流量成效未知。`:'前後差異未知；資料不足或缺日，不補零、不宣稱效果。','measurement-outcome');for(const reason of a.unknown)add(body,'p',reason);
 }
 async function load(publicationId=null,data=undefined){const n=++epoch;busy=true;body.replaceChildren();status.textContent='正在核對版本、發布紀錄與資料…';paint();try{if(data!==undefined)assessPublication(value?.publication,data);const v=await api.readPublicationMeasurement(version,{latest,isCurrent:()=>active(n),publicationId,data});if(!active(n))return;render(v);status.textContent=data?'觀測已保存並核對；仍未驗真流量或因果。':'量測已讀回；未驗真流量或因果。';}catch(e){if(active(n)){form.hidden=!value?.publication;body.replaceChildren();status.textContent='無法關聯：'+e.message+'；未建立比較。';}}finally{if(active(n)){busy=false;paint();}}}
 form.addEventListener('input',e=>{if(e.target===chosen)return;epoch++;busy=false;body.replaceChildren();status.textContent='輸入已改變；尚未保存，請重新核對。';paint();});
 read.onclick=()=>{if(!busy&&!editing)void load();};chosen.onchange=()=>void load(chosen.value);
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy||editing||!value)return;const n=++epoch,pid=chosen.value;busy=true;paint();body.replaceChildren();try{
  const data={baseline:null,followup:null};for(const kind of Object.keys(data)){const file=controls[kind+'-file'].files?.[0];if(!file)continue;if(file.size>1000000)throw Error('CSV 最多 1 MB');const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(!active(n))return;data[kind]={text,source_name:controls.source_name.value,timezone:controls.timezone.value,meta:{page_url:controls.page_url.value,scope:'page',source:source.value,filter:controls.filter.value,type:controls.type.value,start:controls[kind+'-start'].value,end:controls[kind+'-end'].value,exported:controls[kind+'-exported'].value}};}
  if(!active(n))return;busy=false;await load(pid,data);
 }catch(e){if(active(n)){status.textContent='無法關聯：'+e.message;busy=false;paint();}}});
 return {root,setEditing(v){epoch++;editing=v;busy=false;value=null;form.reset();form.hidden=true;body.replaceChildren();status.textContent='版本／編輯狀態已變更，請重新讀取。';paint();}};
}
