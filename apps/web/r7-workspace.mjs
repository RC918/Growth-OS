import {createR7WorkspaceApi as createWorkspaceApi} from './r7-workspace-api.mjs';
import {createIntroSavePanel} from './intro-save-panel.mjs';
import {introSaveEnabled} from './intro-save-config.mjs';
import {r7Runtime} from './r7-workspace-runtime.mjs';
const status=document.getElementById('auth-status'),form=document.getElementById('r7-login'),out=document.getElementById('r7-signout'),root=document.getElementById('intro-save-panel');
const takeHash=()=>{const value=location.hash;if(value)history.replaceState(null,'',location.pathname);return value;};
if(r7Runtime.accessEnabled===true&&r7Runtime.origin==='https://wqepyttadrcnphtyjpjy.supabase.co'&&typeof r7Runtime.key==='string'&&r7Runtime.key.startsWith('sb_publishable_')){
 const api=createWorkspaceApi({...r7Runtime,introReadEnabled:true,introSaveEnabled,redirectOrigin:location.origin}),panel=createIntroSavePanel({root,api:api.intro}),button=form.querySelector('button');
 let epoch=0,consumed=false,otpBusy=false,otpAttempted=false;
 const restart=document.createElement('a');restart.href='/r7-workspace';restart.textContent='重新開啟登入頁';restart.hidden=true;status.after(restart);
 const show=(state,text)=>{status.dataset.state=state;status.textContent=text;};
 const idle=()=>{root.hidden=true;out.hidden=true;form.hidden=false;button.disabled=otpBusy||consumed||otpAttempted;restart.hidden=!consumed;button.setAttribute('aria-busy',String(otpBusy));};
 function clear(){epoch++;api.signOut();panel.close();otpBusy=false;idle();show('signed-out','已登出本頁；本頁不保留登入。請重新開啟登入頁，驗證後才能讀回帳號版本。');}
 out.onclick=clear;window.addEventListener('pagehide',clear);
 form.onsubmit=async e=>{e.preventDefault();if(otpBusy||consumed||otpAttempted)return;const ticket=epoch;otpAttempted=true;otpBusy=true;button.disabled=true;button.setAttribute('aria-busy','true');show('sending','正在請求登入連結…');
 try{await api.requestMagicLink(document.getElementById('email').value,location.origin+'/r7-workspace');if(ticket===epoch)show('email-requested','已請求登入連結。請在已登入此私人站的同一瀏覽器開信；不會自動重寄。');}
 catch{if(ticket===epoch)show('email-error','登入信請求未確認；請勿連續重送，先核對寄信限額。');}
 finally{if(ticket===epoch){otpBusy=false;button.disabled=true;button.setAttribute('aria-busy','false');}}};
 async function callback(){
  const correctPath=location.pathname==='/r7-workspace'&&!location.search;const fragment=takeHash();if(!fragment||consumed)return;consumed=true;const ticket=++epoch;otpBusy=false;api.signOut();panel.close();root.hidden=true;form.hidden=true;out.hidden=false;button.disabled=true;button.setAttribute('aria-busy','false');
  if(!correctPath){idle();button.disabled=true;show('invalid-callback','登入回呼路徑不正確；未使用此連結，也未重新寄信。');return;}
  restart.hidden=true;show('verifying','正在驗證登入身分與工作區資格…');
  try{await api.completeMagicLink(fragment);if(ticket!==epoch)return;root.hidden=false;out.hidden=false;form.hidden=true;panel.open();show('authenticated',introSaveEnabled?'已驗證工作區身分；請讀回 R7 版本。':'已驗證工作區身分；目前僅開放讀取，保存與確認已關閉。');}
  catch(e){if(ticket!==epoch)return;api.signOut();panel.close();idle();button.disabled=true;show(e.message.includes('逾時')?'timeout':'verification-failed',e.message+' 本頁不自動重試或寄信。');}
 }
 idle();show('missing-callback','尚未收到登入回呼；本頁沒有已驗證工作階段，也不會自動寄信。重新整理不會恢復先前登入。');
 window.addEventListener('hashchange',callback);void callback();
}else{takeHash();window.addEventListener('hashchange',takeHash);}
