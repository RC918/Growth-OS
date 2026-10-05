import {loadSnapshot,saveSnapshot} from './baseline-snapshot.mjs';
import {growthReport} from './baseline-report.mjs';
export function createObservationPanel(api) {
  const $=id=>document.getElementById(id);
  let generation=0,selection=0,owner=false,pending=null,saving=false,loading=false;
  const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
  function feedback(value,error=false){const node=$('observation-feedback');node.textContent=value;node.classList.toggle('error',error);node.setAttribute('role',error?'alert':'status');}
  function controls(){ $('save-observation').disabled=!owner||!pending||saving; $('observation-file').disabled=!owner||saving; $('reload-observations').disabled=loading||saving; for(const button of $('observation-list').querySelectorAll('button'))button.disabled=saving; }
  function clear(){pending=null;selection++;$('observation-file').value='';$('observation-preview').hidden=true;$('observation-preview').replaceChildren();controls();}
  function show(loaded,label){
    const report=growthReport(loaded.a.result,loaded.b?.result||null,{a:loaded.a.sample,b:loaded.b?.sample||false},loaded.actions);
    const target=$('observation-preview');target.replaceChildren(text('h3',label),text('h4',report.title),text('p',report.summary.label),text('p',report.summary.detail),text('p',report.summary.provenance),text('p',`優先下一步：${report.summary.nextStep}`));
    for(const [heading,items] of report.sections){const section=document.createElement('details');section.append(text('summary',heading));const list=document.createElement('ul');items.forEach(value=>list.append(text('li',value)));section.append(list);target.append(section);}
    target.hidden=false;
  }
  async function reload(){
    const current=generation; loading=true;controls();
    try{
      const rows=await api.listObservations();if(current!==generation)return;
      const list=$('observation-list');list.replaceChildren();
      if(!rows.length)list.append(text('p','工作區尚未保存觀測版本。'));
      for(const row of rows){
        const card=text('div','');card.className='observation-version';
        card.append(text('p',`保存時間：${new Date(row.created_at).toLocaleString('zh-TW')} · 版本 ID：${row.id}`));
        const button=text('button','查看此版本');button.type='button';button.className='secondary';
        button.addEventListener('click',async()=>{
          const revision=++selection,session=generation;pending=null;controls();$('observation-preview').hidden=true;feedback('讀取版本中…');button.disabled=true;
          try{const saved=await api.readObservation(row.id);if(revision!==selection||session!==generation)return;const loaded=loadSnapshot(JSON.stringify(saved.payload));show(loaded,`已保存版本：${saved.id}`);feedback('已重新驗證並從保存資料計算報告；未覆寫任何版本。');}
          catch(error){if(revision===selection&&session===generation)feedback(error.message,true);}
          finally{if(session===generation)button.disabled=false;}
        });card.append(button);list.append(card);
      }
    }catch(error){if(current===generation)feedback(error.message,true);}
    finally{if(current===generation){loading=false;controls();}}
  }
  $('observation-file').addEventListener('change',async()=>{
    const file=$('observation-file').files[0],revision=++selection,session=generation;pending=null;$('observation-preview').hidden=true;controls();feedback('');if(!file)return;
    try{
      if(file.size>1000000)throw new Error('保存檔須小於 1 MB。');
      const loaded=loadSnapshot(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));
      if(revision!==selection||session!==generation)return;
      const payload=JSON.parse(saveSnapshot(loaded.a.result,loaded.b?.result||null,{a:loaded.a.sample,b:loaded.b?.sample||false},loaded.actions));
      pending={id:crypto.randomUUID(),payload};show(loaded,'待保存：尚未寫入工作區');feedback('檢查通過。按「保存為新觀測版本」才會寫入此工作區。');controls();
    }catch(error){if(revision===selection&&session===generation)feedback(error.message,true);}
  });
  $('observation-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!owner||!pending||saving)return;
    const value=pending,session=generation;saving=true;controls();feedback('保存中…');
    try{
      const id=await api.saveObservation(value.id,value.payload);if(session!==generation)return;
      clear();await reload();if(session===generation)feedback(`已保存版本 ${id}。可從下方查看；舊版本保留。`);
    }catch(error){if(session===generation)feedback(`${error.message}。可重試同一次保存，避免重複建立版本。`,true);}
    finally{if(session===generation){saving=false;controls();}}
  });
  $('reload-observations').addEventListener('click',()=>void reload());
  return {
    async open(role){generation++;owner=role==='owner';saving=false;loading=false;clear();feedback('');$('observation-form').hidden=!owner;await reload();},
    close(){generation++;owner=false;saving=false;loading=false;clear();$('observation-list').replaceChildren();feedback('');},
  };
}
