import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build,tables,writers} from './build.mjs';
test('candidate is deterministic, explicitly scoped and separated from identities/RC/runtime',async()=>{
 const b=await build();for(const [name,value]of Object.entries({'install.sql':b.sql,'enable-save-review.sql':b.enable,'disable-save-review.sql':b.disable,'manifest.json':JSON.stringify(b.manifest,null,2)+'\n'}))assert.equal(await readFile(new URL('./'+name,import.meta.url),'utf8'),value);
 assert.equal(tables.length,14);assert.equal(b.manifest.policies.length,14);assert.equal(b.manifest.functions.filter(f=>f.signature.startsWith('public.')).length,2);
 assert.doesNotMatch(b.sql,/grant\s+select\s+on\s+all|insert into (?:public\.)?organizations|insert into (?:public\.)?organization_members|insert into auth\.|create role|alter role|alter default privileges|10000000-0000|rc\.example|sb_secret_/i);
 assert.doesNotMatch(await readFile(new URL('./build.mjs',import.meta.url),'utf8'),/import.*(fixture|internal-rc|\.\/schema\.mjs)/);
 assert.equal((b.sql.match(/^begin;/gm)??[]).length,1);assert.equal((b.sql.match(/^commit;/gm)??[]).length,1);
 assert.equal((b.sql.match(/grant select on table/g)??[]).length,14);
 for(const signature of writers){assert.ok(b.sql.includes('revoke all on function '+signature)||b.sql.includes(signature));assert.ok(b.enable.includes('grant execute on function '+signature+' to authenticated;'));assert.ok(b.disable.includes('revoke all on function '+signature));}
 assert.equal(b.manifest.functions.filter(f=>f.authenticated.length).length,1);
});
