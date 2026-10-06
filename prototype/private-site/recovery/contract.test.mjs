import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync,symlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pack,verify,newTarget,sha,settledJournal,sqliteSnapshot,names} from './archive.mjs';
import {createStore,openStore} from '../../wordpress-pilot/store.mjs';
const temp=()=>mkdtempSync('/tmp/growth-recovery-contract-');
test('all components bind to one cut; integrity/path/private-mode failures never create target',()=>{
 const d=temp();try{const binding={organization_id:randomUUID(),page_id:1001,pilot_id:randomUUID(),target_url:'https://rc-source.example/growth-os/'};createStore(d+'/store',binding);const s=openStore(d+'/store',binding);s.backup(d+'/j.json');s.close();const c=Object.fromEntries(names.map(n=>[n,{}]));c['publisher-journal']=JSON.parse(readFileSync(d+'/j.json'));c['wordpress-files']={files:['mu-plugins/growth.php','themes/growth-private/style.css','themes/growth-private/index.php','themes/growth-private/functions.php'].map(path=>({path,mode:0o644,data:'',sha256:sha('')}))};c['scanner-sqlite']={base64:'',sha256:sha(''),data:{integrity:'ok'}};const checkpoint={id:randomUUID(),version_id:randomUUID(),binding,cut_at:new Date().toISOString(),quiescence:{all_writers_stopped:true}};
 const p=pack(d+'/a',checkpoint,c);assert.equal(verify(d+'/a',p.sha256).manifest.checkpoint.id,checkpoint.id);assert.throws(()=>newTarget(d+'/a',d,p.sha256),/new absent/);
 assert.throws(()=>newTarget(d+'/a',d+'/rejected','0'.repeat(64)),/checksum/);assert.equal(existsSync(d+'/rejected'),false);
 const file=d+'/a/mariadb.json',bytes=readFileSync(file);chmodSync(file,0o644);assert.throws(()=>verify(d+'/a',p.sha256),/private/);chmodSync(file,0o600);rmSync(file);symlinkSync(d+'/j.json',file);assert.throws(()=>verify(d+'/a',p.sha256),/private/);rmSync(file);writeFileSync(file,bytes,{mode:0o600});
 const component=JSON.parse(bytes);component.checkpoint_id=randomUUID();const mixed=JSON.stringify(component);writeFileSync(file,mixed);const m=JSON.parse(readFileSync(d+'/a/manifest.json'));m.components.mariadb.sha256=sha(mixed);m.components.mariadb.bytes=Buffer.byteLength(mixed);writeFileSync(d+'/a/manifest.json',JSON.stringify(m));assert.throws(()=>newTarget(d+'/a',d+'/mixed',sha(JSON.stringify(m))),/Mixed/);assert.equal(existsSync(d+'/mixed'),false);
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('unknown/submitting/diverged block cut; persistent crash lock is not repaired',()=>{
 const d=temp();try{const binding={organization_id:randomUUID()};createStore(d+'/store',binding);let s=openStore(d+'/store',binding);
 for(const state of ['submitting','unknown','restore_submitting','restore_unknown','state_diverged']){s.journal.append({kind:'operation',operation:{id:'same',state}});s.close();assert.throws(()=>settledJournal(d+'/store/journal.json',binding),/Unsettled/);s=openStore(d+'/store',binding);}
 s.journal.append({kind:'operation',operation:{id:'same',version:'exact',state:'restored'}});s.close();assert.equal(settledJournal(d+'/store/journal.json',binding)[0].state,'restored');writeFileSync(d+'/store/writer.lock','crash',{mode:0o600});assert.throws(()=>settledJournal(d+'/store/journal.json',binding),/crash lock/);assert.throws(()=>openStore(d+'/store',binding));assert.equal(readFileSync(d+'/store/writer.lock','utf8'),'crash');
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('SQLite native backup preserves committed rows independently; corruption is refused',()=>{
 const d=temp();try{execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table snapshots(id text primary key,payload text)'); c.execute('insert into snapshots values (?,?)',('exact','來源')); c.commit(); c.close()",d+'/source']);chmodSync(d+'/source',0o600);const a=sqliteSnapshot(d+'/source',d+'/copy');assert.deepEqual(a.data.rows.snapshots,[['exact','來源']]);execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('insert into snapshots values (?,?)',('new','changed')); c.commit()",d+'/source']);assert.deepEqual(sqliteSnapshot(d+'/copy',d+'/verify').data,a.data);writeFileSync(d+'/broken','invalid',{mode:0o600});assert.throws(()=>sqliteSnapshot(d+'/broken',d+'/refused'));assert.equal(existsSync(d+'/refused'),false);
 }finally{rmSync(d,{recursive:true,force:true});}
});
