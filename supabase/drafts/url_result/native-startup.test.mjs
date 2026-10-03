import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const harness=await readFile(new URL('./native.mjs',import.meta.url),'utf8');
const predicate=harness.match(/await until\(([^\n]+?),40000\)/)?.[1];
assert.ok(predicate,'the actual native harness readiness predicate must be exercised');
test('native readiness rejects the temporary init server even when SELECT 1 succeeds',()=>{
 let pid1='bash',queries=0,answer='1';
 const ready=Function('docker','sql','name',`return (${predicate});`)(args=>{assert.deepEqual(args.slice(0,1),['exec']);return pid1;},()=>{queries++;return answer;},'synthetic-container');
 assert.equal(ready(),false,'temporary Docker entrypoint/init server must not satisfy readiness');assert.equal(queries,0);
 pid1='postgres';answer='';assert.equal(ready(),false);answer='1';assert.equal(ready(),true);
 assert.ok(harness.includes("assert.equal(sql('show listen_addresses'),'')"),'native harness must assert no listening addresses');
});
