import {createR7WorkspaceApi as createWorkspaceApi} from './r7-workspace-api.mjs';
import {createIntroSavePanel} from './intro-save-panel.mjs';
import {introSaveEnabled} from './intro-save-config.mjs';
import {r7Runtime} from './r7-workspace-runtime.mjs';
const status=document.getElementById('auth-status'),form=document.getElementById('r7-login'),out=document.getElementById('r7-signout'),root=document.getElementById('intro-save-panel');
const fragment=location.hash;history.replaceState(null,'',location.pathname);
if(r7Runtime.accessEnabled===true&&r7Runtime.origin==='https://wqepyttadrcnphtyjpjy.supabase.co'&&typeof r7Runtime.key==='string'&&r7Runtime.key.startsWith('sb_publishable_')){
 const api=createWorkspaceApi({...r7Runtime,introReadEnabled:true,introSaveEnabled,redirectOrigin:location.origin}),panel=createIntroSavePanel({root,api:api.intro});form.hidden=false;status.textContent='以既有工作區帳號登入；不建立新帳號。';
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='正在請求登入連結…';try{await api.requestMagicLink(document.getElementById('email').value,location.origin+'/r7-workspace.html');status.textContent='已請求登入連結，請查看信箱。';}catch(e){status.textContent=e.message;}finally{button.disabled=false;button.setAttribute('aria-busy','false');}};
 function clear(){api.signOut();panel.close();root.hidden=true;out.hidden=true;form.hidden=false;status.textContent='已登出本頁；重新登入後從帳號讀回。';}
 out.onclick=clear;window.addEventListener('pagehide',clear);
 if(fragment)try{await api.completeMagicLink(fragment);root.hidden=false;out.hidden=false;form.hidden=true;panel.open();status.textContent=introSaveEnabled?'已驗證既有工作區身分；請讀回 R7 版本。':'已驗證既有工作區身分；目前僅開放讀取，保存與確認已關閉。';}catch(e){clear();status.textContent=e.message;}
}
