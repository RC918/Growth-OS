import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildClaimEngine} from './build-claim-engine.mjs';
await buildClaimEngine();
const names=['growth-console.html','growth-console.css','growth-console.mjs','growth-console-task.mjs','growth-console-demo.json','first-result-review.mjs','first-result-payload.mjs','console-claim-review.mjs','console-claim-engine.mjs'];
await mkdir('delivery/growth-console/dist',{recursive:true});const manifest={route:'/growth-console',api:'/api/product-source',api_included:false,files:{}};
for(const name of names){let bytes=await readFile('apps/web/'+name);if(name.endsWith('.html'))bytes=Buffer.from(bytes.toString().replaceAll('./growth-console','/console-assets/growth-console'));await writeFile('delivery/growth-console/dist/'+name,bytes);manifest.files[name]=createHash('sha256').update(bytes).digest('hex');}
await writeFile('delivery/growth-console/SHA256.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Console static package: '+names.length+' files. Existing Python URL API is a separate unhosted dependency.');
