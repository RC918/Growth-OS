import config from './w1-workspace-config.mjs';
import {createW1Api} from './w1-workspace-api.mjs';
export const workspace=createW1Api(config);
export async function hostedFetch(path,options){try{const body=options.body?JSON.parse(options.body):undefined;const data=await workspace.request(path,{method:options.method,body});return {ok:true,status:200,json:async()=>data};}catch(e){return {ok:false,status:e.status||500,json:async()=>({})};}}
export async function boot(){
 const $=id=>document.getElementById(id),fragment=location.hash;
 history.replaceState(null,'',location.pathname+location.search); // Consume and clear immediately, never persist or echo token.
 $('email-form').onsubmit=async e=>{e.preventDefault();$('send-link').disabled=true;try{await workspace.requestMagicLink($('email').value);$('auth-status').textContent='若此信箱已有工作區資格，將收到登入連結。';}catch{ $('auth-status').textContent='寄送未完成或結果待核對；本頁不會自動重送。';}};
 if(!workspace.available()||location.origin!==config.redirectOrigin||location.pathname!=='/w1-workspace'||location.search){$('email-form').hidden=true;$('auth-status').textContent='工作區尚未開放。';return;}
 if(fragment){try{const member=await workspace.authenticate(fragment);$('actor').value=workspace.canWrite()?member.role:'viewer';await $('login').onclick();}catch{$('auth-status').textContent='登入驗證未完成；未開放資料，也未自動寄信。';}}
 window.addEventListener('pagehide',()=>workspace.clear());
}
