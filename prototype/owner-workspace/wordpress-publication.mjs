// Optional, independently confirmed WordPress path. Off unless the caller has a
// configured server transport; WordPress credentials never enter the browser.
export function wordpressPublication({api,version,isCurrent,latest,profile=null}){
 const root=document.createElement('section');root.className='wordpress-publication'+(profile==='single_site_wordpress'?' pilot-publication':'');
 const add=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;root.append(n);return n;};
 add('h4','WordPress 發布');add('p',profile==='single_site_wordpress'?'單站試點候選：先核對目標頁與三欄差異。歷史紀錄可讀不代表仍有寫入授權。':'受控測試站：先核對網站現況與差異，再確認發布此版本。');
 const preview=add('button','讀取網站現況與差異','wp-preview'),body=add('div','','wp-diff'),label=add('label',''),check=document.createElement('input');check.type='checkbox';check.className='wp-confirm';label.append(check,document.createTextNode('我確認將此版本三欄套用到上方目標頁'));
 const history=add('button','讀取此版本發布紀錄','wp-history');
 const publish=add('button','確認發布','wp-publish'),read=add('button','只讀核對發布結果','wp-readback'),restore=add('button','恢復已核對的發布前內容','wp-restore'),status=add('p','','wp-status'),times=add('p','','wp-times'),details=add('details',''),summary=document.createElement('summary'),evidence=document.createElement('pre');summary.textContent='發布核對紀錄';evidence.className='wp-evidence';details.append(summary,evidence);status.role='status';evidence.style.whiteSpace='pre-wrap';evidence.style.overflowWrap='anywhere';
 const restoreCheck=document.createElement('input');restoreCheck.type='checkbox';restoreCheck.className='wp-restore-confirm';if(profile){const l=document.createElement('label');l.append(restoreCheck,document.createTextNode('我確認恢復此頁發布前的三欄內容'));root.insertBefore(l,restore);}
 for(const n of [preview,publish,read,restore,history])n.type='button';
 let session=api.context(),epoch=0,editing=false,busy=false,intent=null;
 const active=n=>root.isConnected&&isCurrent()&&api.context()===session&&epoch===n&&!editing;
 function paint(){const eligible=session?.role==='owner'&&latest&&!editing&&!busy;history.disabled=session?.role!=='owner'||editing||busy;preview.disabled=!eligible||['unknown','submitting','restore_unknown','state_diverged'].includes(intent?.state);check.disabled=!eligible||intent?.state!=='preview';publish.disabled=!eligible||intent?.state!=='preview'||!check.checked;restoreCheck.disabled=!eligible||intent?.state!=='confirmed_applied';read.disabled=!(session?.role==='owner'&&!editing&&!busy&&(latest||profile==='single_site_wordpress'))||!intent||intent.state==='preview';restore.disabled=!eligible||intent?.state!=='confirmed_applied'||(profile&&!restoreCheck.checked);for(const b of [preview,publish,read,restore,history])b.setAttribute('aria-busy',String(busy));}
 check.onchange=paint;restoreCheck.onchange=paint;
 async function run(action){const n=++epoch;busy=true;paint();status.textContent='正在核對…';try{
  let value=await api.wordpressPublication(action,{version_id:version.id,intent_id:intent?.id,page_id:intent?.page_id,confirm:action==='publish'?check.checked:action==='restore'&&(!profile||restoreCheck.checked)});
  if(!active(n))return;if(action==='history'){value=value.at(-1);if(!value)throw Error('此版本尚無發布紀錄');}intent=value;check.checked=false;restoreCheck.checked=false;body.replaceChildren();
  const p=document.createElement('p');p.textContent=`目標頁：${value.target_url} · 第 ${value.binding.version_number} 版`;body.append(p);
  for(const [key,field]of Object.entries(value.fields)){const section=document.createElement('section');section.dataset.wpField=key;const h=document.createElement('h5');h.textContent=({title:'標題',meta_description:'搜尋摘要',description:'產品描述'})[key];const before=document.createElement('p'),after=document.createElement('p');before.className='wp-before';after.className='wp-after';before.textContent='發布前：'+field.before;after.textContent='套用：'+field.after;section.append(h,before,after);body.append(section);}
  status.textContent=({preview:'尚未發布；請核對差異並確認。',confirmed_applied:'已發布並由 API 與網頁讀回核對。',confirmed_not_applied:'讀回仍是發布前內容；本次不重送。',unknown:'提交結果未知；只可讀回核對，不重送。',state_diverged:'現況不同，停止寫入。',restored:'已恢復發布前內容並讀回核對。',restore_unknown:'恢復結果未知，停止寫入。'})[value.state]??value.state;
  const t=value.evidence??value;times.textContent=`首次發布（平台紀錄）：${t.first_published_at} · 本次修改：${t.modified_at} · 核對時間：${t.observed_at??value.preview_observed_at}`;
  evidence.textContent=JSON.stringify(value.evidence??{first_published_at:value.first_published_at,modified_at:value.modified_at,observed_at:value.preview_observed_at},null,2);
 }catch(e){if(active(n)){status.textContent='無法執行：'+e.message;if(action==='publish'&&intent){intent.state='unknown';status.textContent='提交結果未知；只可讀回核對，不重送。';}if(action==='restore'&&intent){intent.state='restore_unknown';status.textContent='恢復結果未知；只可讀回核對，不重送。';}}}
 finally{if(active(n)){busy=false;paint();}}}
 history.onclick=()=>run('history');preview.onclick=()=>run('preview');publish.onclick=()=>run('publish');read.onclick=()=>run('readback');restore.onclick=()=>run('restore');paint();
 return {root,setEditing(value){epoch++;editing=value;busy=false;check.checked=false;restoreCheck.checked=false;body.replaceChildren();evidence.textContent='';times.textContent='';if(intent?.state==='preview')intent=null;paint();}};
}
