import {publicationMeasurement} from './publication-measurement.mjs';
// Website observations are context only, never automatically attributed to a page/version.
export function measurementPreparation({api,version,isCurrent,latest=false,profile=null,gscEnabled=false}){
 if(profile==='single_site_wordpress'&&gscEnabled)return publicationMeasurement({api,version,isCurrent,latest,profile});
 if(profile==='single_site_wordpress'){const root=document.createElement('section');root.className='pilot-measurement';root.textContent='基線未知 · 後續資料未知 · 效果未知（不是零）。真資料量測尚未接入；發布讀回不代表已有流量或改善效果。';return {root,setEditing(){}};}
 if(api.wordpressPublicationAvailable?.())return publicationMeasurement({api,version,isCurrent,latest});
 const root=document.createElement('section');root.className='measurement-preparation';
 const add=(parent,tag,text,cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;parent.append(node);return node;};
 add(root,'h4','量測準備與資料缺口');add(root,'p','查看此已保存版本還缺哪些證據；未核實發布前，不顯示發布後成效。');
 const read=add(root,'button','讀取量測準備','measurement-read');read.type='button';
 const status=add(root,'p','','measurement-status');status.setAttribute('role','status');
 const body=add(root,'div','','measurement-body'),session=api.context();let ticket=0,busy=false,editing=false;
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session;
 const active=n=>current()&&!editing&&ticket===n;
 function paint(){read.disabled=busy||editing;for(const button of body.querySelectorAll('button'))button.disabled=busy||editing;}
 async function load(observationId=null){
  if(!current()||editing||busy)return;const n=++ticket;busy=true;body.replaceChildren();status.textContent='正在核對確切版本及可讀觀測…';paint();
  try{
   const value=await api.readMeasurementPreparation(version,{latest,observationId,isCurrent:()=>active(n)});if(!active(n))return;
   add(body,'p',`${value.binding.position==='historical'?'歷史':'讀取時最新'}第 ${value.binding.number} 版 · ${value.binding.id}`,'measurement-version');
   add(body,'p',`候選頁：${value.binding.candidate_url}；不代表站點所有權。`,'measurement-target');
   add(body,'p','發布證據：尚未核實；發布時間未知。版本確認／匯出或提供者聲明不能替代發布證據。','measurement-publication');
   add(body,'p','此頁／版本：基線未知 · 後續資料未知 · 發布後成效未知（不是零）。','measurement-outcome');
   const gaps=add(body,'ul','','measurement-gaps');for(const gap of value.gaps)add(gaps,'li',gap);
   add(body,'h5','網站層背景資料，尚未關聯此頁／版本');
   add(body,'p','相同網域、日期或聲明發布路徑均不建立關聯，也不能將差額當成本版效果。僅列最近最多 20 筆可讀觀測，請手動選擇查看。');
   if(!value.choices.length)add(body,'p','工作區尚無可讀觀測；資料未知，不填零。','measurement-empty');
   for(const choice of value.choices){const button=add(body,'button',`查看網站背景 ${choice.created_at} · ${choice.id}`,'measurement-observation');button.type='button';button.dataset.observationId=choice.id;button.addEventListener('click',()=>void load(choice.id));}
   if(value.background){
    const box=add(body,'section','','measurement-background'),report=value.background.report;
    add(box,'h5','網站層背景資料，尚未關聯此頁／版本');add(box,'p',`觀測版本：${value.background.observation_id}`);
    add(box,'p',`網站背景｜${report.summary.label}`);add(box,'p',report.summary.detail);add(box,'p',report.summary.provenance);
    for(const [heading,items]of report.sections){const section=add(box,'details','');add(section,'summary',`網站背景｜${heading}`);const list=add(section,'ul','');for(const item of items)add(list,'li',item);}
   }
   status.textContent='量測準備已讀取；僅供檢視缺口，未核實發布／本版效果。';
  }catch(error){if(active(n)){body.replaceChildren();status.textContent=`無法核對：${error.message}。量測資料維持未知。`;}}
  finally{if(active(n)){busy=false;paint();}}
 }
 read.addEventListener('click',()=>void load());
 return {root,setEditing(value){ticket++;editing=value;busy=false;body.replaceChildren();status.textContent=value?'正在續編；原量測檢視已失效，未保存修改不作量測對象。':'請重新讀取已保存版本的量測準備。';paint();}};
}
