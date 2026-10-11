import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build,derive} from './build.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('same route derived output preserves every other source and all frozen RC bytes',async()=>{
 const m=await build();assert.deepEqual(Object.keys(m.files).filter(f=>m.files[f].derived),['first-result.html','first-result.mjs']);
 assert.deepEqual((await readdir('apps/web')).sort(),(await readdir('delivery/web-preview/dist')).sort());
 for(const [name,entry] of Object.entries(m.files)){const s=await readFile('apps/web/'+name),o=await readFile('delivery/web-preview/dist/'+name);assert.equal(hash(s),entry.source_sha256);assert.equal(hash(o),entry.output_sha256);if(!entry.derived)assert.deepEqual(o,s);}
 const frozen=JSON.parse(await readFile('prototype/internal-rc/deploy/hashes.json'));for(const [file,h]of Object.entries(frozen))assert.equal(hash(await readFile(file)),h,file);
 const js=await readFile('delivery/web-preview/dist/first-result.mjs','utf8');assert.match(js,/fetch\('\/api\/product-source'/);assert.match(js,/navigation.refresh\(\)/);
 const config=JSON.parse(await readFile('vercel.json'));assert.equal(config.outputDirectory,'delivery/web-preview/dist');assert.equal(config.functions['api/product-source.py'].includeFiles,'prototype/public-audit/{scanner,product_source,product_api}.py');
});
test('missing or ambiguous exact hooks fail closed instead of emitting an unwired page',async()=>{
 for(const name of ['first-result.html','first-result.mjs']){const s=await readFile('apps/web/'+name,'utf8');assert.throws(()=>derive(name,''),/hook/);assert.throws(()=>derive(name,s+s),/hook/);}
});
