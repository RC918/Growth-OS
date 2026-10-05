import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore,openStore,restoreBackup} from './store.mjs';
import {createPilotService,validateBinding} from './service.mjs';
const binding={pilot_id:'one',organization_id:'org',page_id:1001,target_url:'https://site.example/growth-os/'};
function fixture(t){const root=mkdtempSync(join(tmpdir(),'growth-pilot-store-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const dir=join(root,'store');createStore(dir,binding);return {root,dir};}
test('closed candidate and exact server binding fail before filesystem or network',()=>{
 assert.throws(()=>createPilotService({config:JSON.parse(readFileSync(new URL('./config.example.json',import.meta.url)))}),/closed/);
 for(const target_url of ['http://site.example/x','https://site.example/','https://user@site.example/x','https://site.example/x?q=1','https://site.example/x#fragment'])assert.throws(()=>validateBinding({...binding,target_url}));
 assert.throws(()=>validateBinding({...binding,control:2}));assert.deepEqual(validateBinding(binding),binding);
});
test('second process cannot open writer; clean new process retains exact Unicode records without grant',t=>{
 const f=fixture(t),s=openStore(f.dir,binding),row={kind:'fixture',text:'🧪 單站記錄'};s.journal.append(row);
 const code=`import {openStore} from ${JSON.stringify(new URL('./store.mjs',import.meta.url).href)};const s=openStore(${JSON.stringify(f.dir)},${JSON.stringify(binding)});console.log(JSON.stringify(s.entries()));s.close();`;
 const blocked=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/EEXIST/);s.close();
 const fresh=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(fresh.status,0,fresh.stderr);assert.deepEqual(JSON.parse(fresh.stdout),[row]);assert.equal(statSync(f.dir+'/journal.json').mode&0o777,0o600);
});
test('exact backup reopens readonly; does not restore credentials or overwrite writable history',t=>{
 const f=fixture(t),s=openStore(f.dir,binding),row={kind:'fixture',text:'history'};s.journal.append(row);const archive=f.root+'/backup.json';s.backup(archive);s.close();
 assert.throws(()=>restoreBackup(archive,f.dir,binding),/new directory/);assert.throws(()=>restoreBackup(archive,f.root+'/wrong',{...binding,organization_id:'foreign'}),/identity/);
 const destination=f.root+'/restored';restoreBackup(archive,destination,binding);const recovered=openStore(destination,binding);assert.deepEqual(recovered.entries(),[row]);assert.equal(recovered.restored,true);assert.throws(()=>recovered.journal.append(row),/readonly/);recovered.close();
 const a=JSON.parse(readFileSync(archive,'utf8'));a.journal+='tamper';writeFileSync(f.root+'/bad.json',JSON.stringify(a));assert.throws(()=>restoreBackup(f.root+'/bad.json',f.root+'/bad',binding),/checksum/);
});
test('crash lock, corruption, partial commit and bound drift never silently repair or reopen writable',t=>{
 const f=fixture(t);const code=`import {openStore} from ${JSON.stringify(new URL('./store.mjs',import.meta.url).href)};openStore(${JSON.stringify(f.dir)},${JSON.stringify(binding)});process.kill(process.pid,'SIGKILL');`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',code]).signal,'SIGKILL');assert.throws(()=>openStore(f.dir,binding),/EEXIST/);
 const other=f.root+'/other';createStore(other,binding);assert.throws(()=>openStore(other,{...binding,pilot_id:'other'}),/identity/);writeFileSync(other+'/journal.json.next','partial');assert.throws(()=>openStore(other,binding),/Incomplete/);assert.equal(readFileSync(other+'/journal.json.next','utf8'),'partial');
});
