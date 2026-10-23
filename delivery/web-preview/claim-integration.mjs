// Explicit isolated derived candidate. No deployment/config source is changed.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {derive} from './build.mjs';
const root=new URL('../../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
export function deriveClaim(name,text){
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Missing or ambiguous claim integration anchor: '+name);text=text.replace(from,to);};
 if(name==='workspace.mjs')replace("import { createWorkspaceApi, contentVersionKind } from './workspace-api.mjs';","import { createWorkspaceApi, contentVersionKind } from './claim-guarded-workspace-api.mjs';");
 if(name==='url-result-save.mjs'){
  replace("import {createTrialMarker}","import {assertSavedClaims} from './saved-claim-context.mjs';\nimport {createTrialMarker}");
  replace('const frozen=copyJSON(value);await validateReport(frozen);','const frozen=copyJSON(value);await validateReport(frozen);await assertSavedClaims(frozen);');
 }
 return text;
}
export async function buildClaimIntegration({directory}){
 assert.ok(directory&&directory.startsWith('/'),'Explicit isolated absolute output required');
 assert.ok(!directory.startsWith(fileURLToPath(root)),'Output must be outside source checkout');
 await mkdir(directory,{recursive:true});
 const frozen=JSON.parse(await readFile(new URL('prototype/internal-rc/deploy/hashes.json',root)));
 for(const [path,expected] of Object.entries(frozen))assert.equal(hash(await readFile(new URL(path,root))),expected,'Frozen source drift: '+path);
 const manifest={base_tree:'a71362a37f977fa36a22ffc77e6485bc3347c902',kind:'client-claim-integration',frozen_files_verified:Object.keys(frozen).length,files:{}};
 for(const e of (await readdir(new URL('apps/web/',root),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  assert.ok(e.isFile(),'Unexpected web entry');
  const source=await readFile(new URL('apps/web/'+e.name,root));
  const output=Buffer.from(deriveClaim(e.name,derive(e.name,source.toString('utf8'))));
  await writeFile(directory+'/'+e.name,output);
  manifest.files[e.name]={source_sha256:hash(source),output_sha256:hash(output),derived:!source.equals(output)};
 }
 await writeFile(directory+'/claim-integration-manifest.json',JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildClaimIntegration({directory:process.argv[2]}),null,2));
