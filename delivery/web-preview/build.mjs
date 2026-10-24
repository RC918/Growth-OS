import {readFile,writeFile,mkdir,readdir,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {deriveClaim} from './claim-transform.mjs';
import {deriveWorkspace} from './workspace-integration.mjs';
import {deriveExperience,experienceFiles} from '../first-result-workspace/derive.mjs';
const root=new URL('../../',import.meta.url),output=new URL('./dist/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
export function derive(name,text){
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Missing or ambiguous navigation hook: '+name);text=text.replace(from,to);};
 if(name==='first-result.html')replace('<div id="result-fields">','<div role="group" aria-labelledby="review-next-heading"><h3 id="review-next-heading">現在先處理哪裡</h3><p id="review-next-reason" role="status" aria-live="polite" aria-atomic="true"></p><div class="actions"><button id="review-next" type="button" aria-describedby="review-next-reason">前往核稿</button></div></div>\n<div id="result-fields">');
 if(name==='first-result.mjs'){
  replace("import {createResultHandoff}","import {createReviewNavigation} from './first-result-navigation.mjs';\nimport {createResultHandoff}");
  replace('const errors=',"const navigation=createReviewNavigation({getView:()=>review?.view(),isBusy:()=>!!controller});\nconst errors=");
  replace('\n}\nfunction render(r){','\n navigation.refresh();\n}\nfunction render(r){');
  replace("robots_unavailable:'無法核對 robots 規則，已停止讀取；可改用允許讀取的公開頁。'","robots_unavailable:'無法核對 robots 規則（網站未正常回應 robots.txt），已停止讀取；請稍後重試，或改貼同一網站可公開讀取的產品詳細頁。'");
  replace("report('本次未產生新成果；網址保留，請選產品候選或改用公開產品頁。');return;","if(r.opportunity_summary){const s=r.opportunity_summary;box.append(node('h3','本頁機會摘要'));box.append(node('p','頁面類型：'+s.page_kind+'；標題：'+(s.site_title||'未提供')));if(s.headline)box.append(node('p','主要標題：'+s.headline));box.append(node('p',s.note));if(s.recommended_candidate)box.append(node('p','推薦候選：'+s.recommended_candidate.label+'（'+s.recommended_candidate.reason+'）'));}if(r.guidance){box.append(node('h3','下一步'));const steps=node('ul');for(const step of r.guidance.next_steps)steps.append(node('li',step));box.append(steps);}report('本次未產生新成果；網址保留，請依下一步選擇產品頁。');return;");
  replace("report('第一份文本已備妥，請檢查來源及待確認資訊；尚未發布。');","report(r.auto_selected?'已自動帶入唯一產品候選並取得成果（'+r.auto_selected.candidate_url+'）；請檢查來源及待確認資訊；尚未發布。':'第一份文本已備妥，請檢查來源及待確認資訊；尚未發布。');");
 }
 // Phase 1 Preview only: enable the existing First Result -> Workspace save
 // chain (handoff/import -> save_url_result_draft RPC) in the derived output.
 // Frozen apps/web sources stay closed; staging RLS/RPC still enforce owner-only.
 if(name==='url-result-config.mjs')replace('export const urlSaveEnabled=false;','export const urlSaveEnabled=true;');
 return deriveExperience(name,text);
}
export async function build(){
 // This directory is generated output only; never touch apps/web or RC artifacts.
 try{assert.ok((await lstat(output)).isDirectory());await rm(output,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(output,{recursive:true});const manifest={kind:'derived-first-result-navigation',source_directory:'apps/web',files:{}};
 for(const entry of (await readdir(new URL('apps/web/',root),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  assert.ok(entry.isFile()&&/\.(html|css|mjs|js|json|md|txt|csv)$/.test(entry.name),'Unexpected web source: '+entry.name);
  const source=await readFile(new URL('apps/web/'+entry.name,root)),derived=['first-result.html','first-result.mjs','url-result-config.mjs','url-result-save.mjs','workspace.mjs','workspace.html'].includes(entry.name)||experienceFiles.has(entry.name),bytes=derived?Buffer.from(deriveWorkspace(entry.name,deriveClaim(entry.name,derive(entry.name,source.toString('utf8'))))):source;
  await writeFile(new URL(entry.name,output),bytes);manifest.files[entry.name]={source_sha256:hash(source),output_sha256:hash(bytes),derived};
 }
 await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const m=await build();console.log('Derived preview built; '+Object.keys(m.files).length+' files, derived files (navigation, save gate, claims, A workspace and selected UIUX).');}
