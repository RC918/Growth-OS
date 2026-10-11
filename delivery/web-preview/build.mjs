import {readFile,writeFile,mkdir,readdir,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),output=new URL('./dist/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
export function derive(name,text){
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Missing or ambiguous navigation hook: '+name);text=text.replace(from,to);};
 if(name==='first-result.html')replace('<div id="result-fields">','<div role="group" aria-labelledby="review-next-heading"><h3 id="review-next-heading">現在先處理哪裡</h3><p id="review-next-reason" role="status" aria-live="polite" aria-atomic="true"></p><div class="actions"><button id="review-next" type="button" aria-describedby="review-next-reason">前往核稿</button></div></div>\n<div id="result-fields">');
 if(name==='first-result.mjs'){
  replace("import {createResultHandoff}","import {createReviewNavigation} from './first-result-navigation.mjs';\nimport {createResultHandoff}");
  replace('const errors=',"const navigation=createReviewNavigation({getView:()=>review?.view(),isBusy:()=>!!controller});\nconst errors=");
  replace('\n}\nfunction render(r){','\n navigation.refresh();\n}\nfunction render(r){');
 }
 return text;
}
export async function build(){
 // This directory is generated output only; never touch apps/web or RC artifacts.
 try{assert.ok((await lstat(output)).isDirectory());await rm(output,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(output,{recursive:true});const manifest={kind:'derived-first-result-navigation',source_directory:'apps/web',files:{}};
 for(const entry of (await readdir(new URL('apps/web/',root),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  assert.ok(entry.isFile()&&/\.(html|css|mjs|js|json|md|txt|csv)$/.test(entry.name),'Unexpected web source: '+entry.name);
  const source=await readFile(new URL('apps/web/'+entry.name,root)),derived=['first-result.html','first-result.mjs'].includes(entry.name),bytes=derived?Buffer.from(derive(entry.name,source.toString('utf8'))):source;
  await writeFile(new URL(entry.name,output),bytes);manifest.files[entry.name]={source_sha256:hash(source),output_sha256:hash(bytes),derived};
 }
 await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const m=await build();console.log('Derived preview built; '+Object.keys(m.files).length+' files, exactly two presentation hooks.');}
