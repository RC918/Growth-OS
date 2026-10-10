import config from './w1-workspace-config.mjs';
import {createW1Api} from './w1-workspace-api.mjs';
export const workspace=createW1Api(config);
export async function hostedFetch(path,options){try{const body=options.body?JSON.parse(options.body):undefined;const data=await workspace.request(path,{method:options.method,body});return {ok:true,status:200,json:async()=>data};}catch(e){return {ok:false,status:e.status||500,json:async()=>({})};}}
export async function boot({repaint=()=>{}}={}){
 const $=id=>document.getElementById(id),fragment=location.hash;let timer,last=null;
 history.replaceState(null,'',location.pathname+location.search);
 const paint=(force=false)=>{const state=JSON.stringify([!!workspace.context(),workspace.canWrite('answer'),workspace.canWrite('review')]);if(state===last&&!force)return;last=state;$('check-window').hidden=!workspace.context();$('window-status').textContent=!workspace.context()?'':workspace.canWrite()?'已讀回目前可操作狀態；保存與確認仍由伺服器核對期限及次數。':'目前只能讀取已保存內容。開放操作後，按「核對寫入狀態」即可繼續，無須重新登入。';repaint();};
 const check=async()=>{$('check-window').disabled=true;try{const pending=workspace.refreshWriteStatus();paint(true);$('window-status').textContent='正在核對目前寫入狀態…';await pending;paint(true);}catch{paint(true);$('window-status').textContent='未取得可用寫入狀態；保持唯讀，沒有送出保存或確認。';}finally{$('check-window').disabled=false;}};
 $('check-window').onclick=check;
 $('email-form').onsubmit=async e=>{e.preventDefault();if($('send-link').disabled)return;$('send-link').disabled=true;$('send-link').setAttribute('aria-busy','true');$('send-link').textContent='正在寄送…';$('auth-status').textContent='正在等待寄送結果，請勿重複操作。';try{await workspace.requestMagicLink($('email').value);$('auth-status').textContent='若此信箱已有工作區資格，將收到登入連結。';}catch{$('auth-status').textContent='寄送未完成或結果待核對；本頁不會自動重送。';}finally{$('send-link').setAttribute('aria-busy','false');$('send-link').textContent='寄送登入連結';}};
 if(!workspace.available()||location.origin!==config.redirectOrigin||location.pathname!=='/w1-workspace'||location.search){$('email-form').hidden=true;$('auth-status').textContent='工作區尚未開放。';return;}
 if(fragment){try{const member=await workspace.authenticate(fragment);$('actor').value=member.role;await $('login').onclick();if(workspace.context())await check();}catch{$('auth-status').textContent='登入驗證未完成；未開放資料，也未自動寄信。';}}
 paint();timer=setInterval(paint,500); // Local expiry/UI update only; no polling, refresh, or OTP traffic.
 window.addEventListener('pagehide',()=>{clearInterval(timer);workspace.clear();});
 $('send-link').disabled=false;
 if(!fragment)$('auth-status').textContent='登入介面已就緒；請輸入電子郵件，並只按一次寄送。';
}
