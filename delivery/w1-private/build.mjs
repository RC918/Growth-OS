import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='delivery/w1-private/dist/';await mkdir(dir,{recursive:true});
const files=['w1-workspace-entry.js','first-result.css','product-fact.css','w1-workspace-api.mjs','w1-workspace-config.mjs','w1-workspace-boot.mjs','r7-workspace-api.mjs','intro-save.mjs','intro-r7-review.mjs','intro-candidate.mjs','w1-publication-preview.mjs','url-publish-preview.mjs'];
for(const file of files)await writeFile(dir+file,await readFile('apps/web/'+file));
// W1-only login spacing; shared source CSS and existing R7 delivery stay intact.
await writeFile(dir+'product-fact.css',(await readFile('apps/web/product-fact.css','utf8'))+'\n#email-form{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start}#email-form input{width:100%;min-width:0}#email-form button{margin-top:16px;min-height:44px}@media(max-width:600px){#email-form button{width:100%}}\n');
let html=await readFile('apps/web/product-fact.html','utf8');
html=html.replace("connect-src 'self'", "connect-src https://wqepyttadrcnphtyjpjy.supabase.co").replace('隔離工程驗證','產品工作區').replace(/<h2>隔離工作區<\/h2>.*?<p id="auth-status" role="status">.*?<\/p>/,'<h2>產品工作區</h2><p>以既有帳號登入；資料與操作資格由工作區驗證。</p><input id="actor" type="hidden" value="viewer"><form id="email-form"><label for="email">電子郵件</label><input id="email" type="email" autocomplete="email" required><button id="send-link" type="submit" disabled>寄送登入連結</button></form><button id="login" hidden>讀取工作區</button><button id="logout" hidden>登出本頁</button><p id="auth-status" role="status">登入介面初始化中，暫時無法寄送。若此訊息持續顯示，請停止操作並回報。</p><button id="check-window" hidden>核對寫入狀態</button><p id="window-status" role="status"></p>');
html=html.replace('<script type="module" src="./product-fact.mjs"></script>','<script defer src="./w1-workspace-entry.js"></script>').replace('<form id="email-form">','<noscript><p role="status">此瀏覽器未啟用 JavaScript，無法載入登入介面或寄送連結。請停止操作並回報。</p></noscript><form id="email-form">');
html=html.replaceAll('./','/w1-assets/');
await writeFile(dir+'index.html',html);
let ui=await readFile('apps/web/product-fact.mjs','utf8');
ui=ui.replace('// W1 isolated surface: same-origin runner only; no hosted configuration or browser persistence.',"import {hostedFetch,boot,workspace} from './w1-workspace-boot.mjs';").replace("fetch('/w1/'+path,",'hostedFetch(path,').replace('已驗證原生隔離 Auth 身分；答案由隔離 PostgreSQL 保存。','已驗證既有 Auth 與工作區資格；寫入仍受伺服器窗口限制。').replace("$('login').hidden=false;","$('login').hidden=true;$('email-form').hidden=false;").replace("$('logout').hidden=false;","$('logout').hidden=false;$('email-form').hidden=true;");
ui=ui.replace("($('actor').value==='viewer'&&['save','skip','review','correct'].includes(id))","(['save','skip','correct'].includes(id)&&!workspace.canWrite('answer')||id==='review'&&!workspace.canWrite('review'))").replace("current.answer==='unknown'||$('actor').value==='viewer'","current.answer==='unknown'||!workspace.canWrite('answer')").replace("current.source_changed||$('actor').value==='viewer'","current.source_changed||!workspace.canWrite('review')");
const policy="function repaintWritePolicy(){if(!current)return;$('correct').hidden=current.answer==='unknown'||!workspace.canWrite('answer');$('review-panel').hidden=!current.draft_id||current.review_valid||current.is_conflict||current.source_changed||!workspace.canWrite('review');lock();}\n";
// Reuse the existing publication panel, scoped to the current W1 readback.
ui="import {urlPublishPreview} from './url-publish-preview.mjs';\nlet publication=null;\n"+ui;
const inject=(from,to)=>{assert.ok(ui.includes(from),'Missing W1 publication hook: '+from);ui=ui.replace(from,to);};
inject('function render(){','function render(){publication?.root.remove();publication=null;');
inject('function clear(){','function clear(){publication?.root.remove();publication=null;');
inject("$('review-panel').hidden=!current.draft_id||current.review_valid||current.is_conflict||current.source_changed||!workspace.canWrite('review');lock();", "$('review-panel').hidden=!current.draft_id||current.review_valid||current.is_conflict||current.source_changed||!workspace.canWrite('review');lock();if(current.draft_id){const own=epoch,version=current;publication=urlPublishPreview({api:workspace,version,latest:true,isCurrent:()=>epoch===own&&current===version&&!pending&&!busy});$('result').append(publication.root);publication.setEditing(busy||!!pending);}");
inject("$('correct').onclick=()=>{", "$('correct').onclick=()=>{publication?.setEditing(true);");
inject("$('refresh').onclick=()=>read().catch(e=>feedback(e.message));", "$('refresh').onclick=()=>{publication?.setEditing(true);return read().catch(e=>feedback(e.message));};");
inject('function lock(){', 'function lock(){if(publication&&(busy||pending))publication.setEditing(true);');
await writeFile(dir+'product-fact.mjs',ui+'\n'+policy+'export function startWorkspace(){return boot({repaint:repaintWritePolicy}).catch(error=>{workspace.clear();throw error;});}\n');
assert.deepEqual((await readdir(dir)).sort(),[...files,'index.html','product-fact.mjs'].sort(),'Unexpected file in closed deployment package');
const manifest={};for(const f of (await readdir(dir)).sort())manifest[f]=createHash('sha256').update(await readFile(dir+f)).digest('hex');await writeFile('delivery/w1-private/SHA256.json',JSON.stringify(manifest,null,2)+'\n');
