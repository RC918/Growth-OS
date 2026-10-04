import {preview} from './search-baseline.mjs';

// Applicability of caller-described, page-filtered daily rows; never publication authority.
export function checkPageCsv(text,meta,candidate){
 const keys=['page_url','scope','source','filter','type','start','end','exported'];
 if(!meta||Object.keys(meta).length!==keys.length||keys.some(k=>typeof meta[k]!=='string'))throw Error('資料說明欄位不完整或含不支援欄位。');
 if(!['synthetic','provider_asserted'].includes(meta.source))throw Error('來源只能是合成範例或提供者聲明，不能自行標為已核實。');
 if(!['page','site'].includes(meta.scope))throw Error('請明確選擇頁面篩選或網站彙總。');
 if(!meta.filter.trim()||meta.filter.length>1000)throw Error('請提供 1 至 1000 字的匯出篩選說明。');
 const page=value=>{let url;try{url=new URL(value);}catch{throw Error('請提供完整 HTTPS 頁面 URL。');}if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port)throw Error('頁面 URL 不可含帳密、片段或自訂連接埠。');return url;};
 const target=page(candidate),declared=page(meta.page_url);
 // Reuse daily arithmetic/validation only. Do not promote website snapshot format.
 const daily=preview(text,{origin:declared.origin,type:meta.type,start:meta.start,end:meta.end,exported:meta.exported});
 const matches=declared.href===target.href,applicable=meta.scope==='page'&&matches;
 return {page_url:declared.href,candidate_url:target.href,scope:meta.scope,source:meta.source,filter:meta.filter.trim(),matches,applicable,
  reason:meta.scope==='site'?'網站彙總不可作為此頁基線。':!matches?'頁面不吻合；同網域或不同參數的頁面不可作為此頁基線。':'聲明的頁面 URL 與候選頁吻合；僅可檢視頁面觀測，不代表資料或篩選已核實。',
  type:daily.type,start:daily.start,end:daily.end,exported:daily.exported,days:daily.days,rows:daily.rows,missing:daily.missing,complete:daily.complete,clicks:daily.clicks,impressions:daily.impressions,ctr:daily.ctr,
  publication:{status:'unverified',published_at:null},version_effect:{clicks:null,impressions:null,causal_claim:false}};
}

export function pageObservation({api,version,isCurrent,latest=false}){
 const root=document.createElement('section');root.className='page-observation';
 const add=(parent,tag,text,cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;parent.append(node);return node;};
 add(root,'h4','檢查頁面級資料適用性');
 add(root,'p','暫存一份已按確切頁面篩選的每日 CSV（date,clicks,impressions，最多 1 MB）。只在本頁記憶體檢查；關閉版本、切換工作區／session 或續編即清除。');
 const form=add(root,'form','','page-data-form'),controls={};
 function field(key,label,type='text',options=null){const wrap=add(form,'label',label);const input=add(wrap,options?'select':'input','');input.name=key;input.className='page-data-'+key;if(options)for(const [value,text]of options){const option=add(input,'option',text);option.value=value;}else input.type=type;input.required=true;controls[key]=input;return input;}
 const file=field('csv','每日 CSV 檔案','file');file.accept='.csv,text/csv';
 field('scope','匯出範圍','text',[['','請選擇'],['page','已按確切頁面篩選'],['site','網站彙總（不可作為頁面基線）']]);
 field('page_url','篩選的完整頁面 URL','url');
 field('type','搜尋類型','text',[['','請選擇'],['web','Web'],['image','Image'],['video','Video'],['news','News']]);
 field('start','期間開始','date');field('end','期間結束','date');
 field('exported','匯出時間（含時區）').placeholder='2026-09-05T00:00:00Z';
 field('source','資料來源','text',[['','請選擇'],['synthetic','合成範例'],['provider_asserted','提供者聲明（未獨立驗真）']]);
 field('filter','匯出篩選說明（如 page 等於完整 URL；其他篩選條件）').maxLength=1000;
 const read=add(form,'button','檢查這份頁面資料','page-data-read');read.type='submit';
 const clear=add(root,'button','清除暫存資料','page-data-clear');clear.type='button';
 const status=add(root,'p','','page-data-status');status.setAttribute('role','status');
 const body=add(root,'div','','page-data-body'),session=api.context();let ticket=0,busy=false,editing=false;
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session;
 const active=n=>current()&&!editing&&ticket===n;
 function paint(){read.disabled=busy||editing;for(const control of Object.values(controls))control.disabled=editing;clear.disabled=editing;}
 function invalidate(message,reset=false){ticket++;busy=false;body.replaceChildren();if(reset)form.reset();status.textContent=message;paint();}
 form.addEventListener('input',()=>invalidate('輸入已改變；請重新檢查。'));form.addEventListener('change',()=>invalidate('選擇已改變；請重新檢查。'));
 clear.addEventListener('click',()=>invalidate('暫存資料已清除。',true));
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!current()||editing||busy)return;
  const n=++ticket,selected=file.files?.[0],meta=Object.fromEntries(Object.entries(controls).filter(([key])=>key!=='csv').map(([key,node])=>[key,node.value]));
  busy=true;body.replaceChildren();status.textContent='正在檢查 CSV 與確切保存版本…';paint();
  try{
   if(!selected||selected.size>1000000)throw Error('請選擇最多 1 MB 的每日 CSV。');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(await selected.arrayBuffer());if(!active(n))return;
   const delivery=await api.readSavedUrlDelivery(version,{latest,isCurrent:()=>active(n)});if(!active(n))return;
   const out=checkPageCsv(text,meta,delivery.source.candidate_url);
   add(body,'p',`${delivery.version.position==='historical'?'歷史':'讀取時最新'}第 ${delivery.version.number} 版 · ${delivery.version.id} · 工作區 ${delivery.version.organization_id}`,'page-data-binding');
   add(body,'p',`候選頁：${out.candidate_url}；資料聲明頁：${out.page_url}`,'page-data-target');
   add(body,'p',out.reason,'page-data-applicability');
   add(body,'p',`${out.source==='synthetic'?'合成範例':'提供者聲明資料'} · 未獨立驗真；URL 吻合不代表已核實、站點所有權或發布。`,'page-data-provenance');
   add(body,'p',`搜尋：${out.type} · 期間：${out.start} 至 ${out.end} · 匯出：${out.exported} · 範圍：${out.scope==='page'?'聲明按頁面篩選':'網站彙總'}`);
   add(body,'p',`匯出篩選說明：${out.filter}`,'page-data-filter');
   add(body,'p',`覆蓋 ${out.rows.length}/${out.days} 天 · ${out.complete?'完整':'不完整，缺日不填零'}；缺少日期：${out.missing.join('、')||'無'}`,'page-data-coverage');
   add(body,'p',`已提供日期合計：點擊 ${out.clicks}、曝光 ${out.impressions}；CTR ${out.ctr===null?'未知（曝光為零）':(out.ctr*100).toFixed(2)+'%'}。${out.complete?'':'不是完整期間總量。'}`,'page-data-totals');
   const details=add(body,'details','');add(details,'summary','檢視每日資料（明確零與缺日分開）');const list=add(details,'ul','','page-data-days');for(const row of out.rows)add(list,'li',`${row.date}：點擊 ${row.clicks}、曝光 ${row.impressions}`);
   add(body,'p','發布證據尚未核實，發布時間／本版發布後成效未知（不是零）；這份暫存觀測不建立發布前後關聯，也不能歸因於此版本。','page-data-effect');
   status.textContent=out.applicable?'檢查完成：頁面聲明吻合，僅供觀測。':'檢查完成：不適用於此頁基線。';
  }catch(error){if(active(n)){body.replaceChildren();status.textContent=`無法檢查：${error.message}。未建立頁面基線。`;}}
  finally{if(active(n)){busy=false;paint();}}
 });
 return {root,setEditing(value){editing=value;invalidate(value?'正在續編；暫存資料已清除。':'請重新選取資料並檢查已保存版本。',true);}};
}
