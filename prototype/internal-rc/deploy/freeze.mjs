// Build-only candidate manifest. Never modifies prior milestone frozen artifacts.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory()){if(e.name!=='__pycache__')await walk(p);}else if(!p.endsWith('/hashes.json')&&!p.endsWith('/window.example.json'))files.push(p);}}
for(const dir of ['prototype/internal-rc','prototype/wordpress-publish','apps/web','supabase/migrations'])await walk(dir);
files.push('package.json','package-lock.json','prototype/owner-workspace/session-browser.mjs','prototype/public-audit/scanner.py','prototype/public-audit/product_source.py','prototype/public-audit/product_api.py','supabase/drafts/url_review/fixture.mjs','supabase/drafts/first_result_save/fixtures.mjs');
for(const f of ['first_result_save/proposal.sql','first_result_save/disable_writes.sql','url_result/proposal.sql','url_review/proposal.sql'])files.push('supabase/drafts/'+f);
const hashes={};for(const path of files.sort())hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(new URL('./hashes.json',import.meta.url),JSON.stringify(hashes,null,2)+'\n');
const digest=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');await writeFile(new URL('./window.example.json',import.meta.url),JSON.stringify({environment:'growth-internal-rc-01',owner_approval_reference:null,expires_at:null,artifacts_digest:digest},null,2)+'\n');console.log(digest);
