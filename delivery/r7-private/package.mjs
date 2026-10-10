// Buildless, explicit allowlist: never package repo settings, identities or secrets.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='delivery/r7-private/';
const extra=['r7-workspace.html','r7-workspace.mjs','r7-workspace-api.mjs','r7-workspace-runtime.mjs','intro-save.mjs','intro-save-panel.mjs','intro-save-config.mjs'];
const manifest=JSON.parse(await readFile(root+'SHA256.json','utf8'));
for(const name of extra)await copyFile('apps/web/'+name,root+'dist/'+name);
for(const name of extra)manifest.files['dist/'+name]=createHash('sha256').update(await readFile(root+'dist/'+name)).digest('hex');
manifest.runtime_configuration={file:'dist/r7-workspace-runtime.mjs',origin:'https://wqepyttadrcnphtyjpjy.supabase.co',key:null,accessEnabled:false,writer_file:'dist/intro-save-config.mjs',introSaveEnabled:false,callback:'location.origin + /r7-workspace.html'};
await writeFile(root+'SHA256.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Packaged '+Object.keys(manifest.files).length+' allowlisted assets; default auth/read/write closed.');
