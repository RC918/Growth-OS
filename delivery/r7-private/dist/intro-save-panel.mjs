import {validateR7} from './intro-r7-review.mjs';
export function createIntroSavePanel({root,api,loadFrame=async()=>{const r=await fetch('./intro-r7.json',{credentials:'same-origin',redirect:'error'});if(!r.ok)throw Error('無法讀取 R7');return r.json();}}){
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 let epoch=0,busy=false,loaded=false,frame=null,row=null,unknown=false;
 const title=node('h2','R7 介紹 · 帳號保存'),copy=node('p',''),check=document.createElement('input');check.type='checkbox';
 const label=node('label','');label.className='review-check';label.append(check,document.createTextNode('已核對此候選、來源與版本'));
 const read=node('button','讀取候選與已保存版本'),save=node('button','保存此候選'),confirm=node('button','確認已保存版本'),status=node('p','介紹保存尚未啟用；目前沒有帳號保存。');status.role='status';status.id='intro-save-status';
 for(const b of [read,save,confirm]){b.type='button';b.setAttribute('aria-describedby',status.id);b.style.minHeight='44px';}
 const evidence=node('p','');
 const actions=node('div','');actions.className='actions';actions.append(read,save,confirm);root.append(title,copy,evidence,label,actions,status);
 function paint(){for(const b of [read,save,confirm])b.setAttribute('aria-busy',String(busy));const enabled=api.available();read.disabled=!api.readable()||busy;save.disabled=!enabled||busy||!loaded||!check.checked||unknown||!!row;confirm.disabled=!enabled||busy||!row||!check.checked||unknown||!!row.confirmation;check.disabled=!enabled||busy||!loaded;confirm.textContent=row?.confirmation?'已確認此保存版本':'確認已保存版本';}
 async function run(action){const ticket=++epoch;busy=true;paint();status.textContent='正在核對…';try{
 if(action==='read'){const f=await loadFrame();await validateR7(f);const r=await api.reconcile();if(ticket!==epoch)return;frame=f;row=r;loaded=true;unknown=false;check.checked=false;copy.textContent=f.payload.candidate.output.candidate;evidence.textContent='原文：'+f.payload.candidate.source.fields.intro_description+'\n來源：'+f.payload.candidate.source.url+'\n來源版本：'+f.payload.candidate.source.version+'\n候選版本：'+(r?.candidate_hash||'3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04');}
 else {unknown=true;const result=action==='save'?await api.save(frame,row,{isCurrent:()=>ticket===epoch}):await api.confirm(row,{isCurrent:()=>ticket===epoch});if(ticket!==epoch)return;row=result;unknown=false;check.checked=false;}
 if(ticket!==epoch)return;status.textContent=row?(row.confirmation?'已確認並讀回':'已保存並讀回')+'第 '+row.version+' 版 · '+row.candidate_hash+' · 未發布': (api.available()?'尚未保存；請核對候選後保存。':'尚未保存；目前僅開放讀取。');
 }catch(e){if(ticket===epoch)status.textContent=e.message;}finally{if(ticket===epoch){busy=false;paint();}}}
 read.onclick=()=>run('read');save.onclick=()=>run('save');confirm.onclick=()=>run('confirm');check.onchange=paint;paint();
 return {close(){epoch++;busy=false;loaded=false;frame=null;row=null;unknown=false;check.checked=false;copy.textContent='';evidence.textContent='';status.textContent=api.readable()?'請重新讀回此工作階段的版本。':'介紹保存尚未啟用；目前沒有帳號保存。';paint();},open(){this.close();}};
}
