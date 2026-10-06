// Fixed candidate format. A trusted manifest digest is required; hashes are not signatures.
import {mkdirSync,lstatSync,readFileSync,writeFileSync,readdirSync,existsSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonical} from '../../../apps/web/first-result-payload.mjs';
import {openRunJournal} from '../../wordpress-publish/journal.mjs';
export const names=['wordpress-files','mariadb','scanner-sqlite','publisher-journal','native-business'];
export const sha=v=>createHash('sha256').update(v).digest('hex');
export function privatePath(path,directory=false){const s=lstatSync(path);if(s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||(directory?!s.isDirectory():!s.isFile()||s.nlink!==1)||(!directory&&s.size>40*1024*1024))throw Error('Owned private regular path required');}
const sync=p=>{const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
export function writePrivate(p,bytes){writeFileSync(p,bytes,{flag:'wx',mode:0o600});sync(p);}
export function settledJournal(path,binding){
 const source=JSON.parse(readFileSync(path,'utf8'));if(canonical(source.bound.binding)!==canonical(binding))throw Error('Journal binding mismatch');
 if(existsSync(path.replace(/journal\.json$/,'writer.lock')))throw Error('Writer/crash lock remains; never remove automatically');
 const j=openRunJournal(path,source.bound),latest=new Map();for(const e of j.entries)if(e.kind==='operation')latest.set(e.operation.id,e.operation);
 if([...latest.values()].some(e=>!['preview','confirmed_applied','confirmed_not_applied','restored'].includes(e.state)))throw Error('Unsettled operation blocks backup; original GET reconciliation only');
 return [...latest.values()].map(e=>({id:e.id,version:e.version,state:e.state,observed_at:e.restore_observed_at??e.evidence?.observed_at??e.observed}));
}
export function pack(destination,checkpoint,components){
 if(existsSync(destination))throw Error('New archive directory required');
 if(Object.keys(components).sort().join()!==[...names].sort().join())throw Error('All five components required');
 if(!checkpoint.id||!checkpoint.version_id||!checkpoint.binding||!checkpoint.cut_at||!checkpoint.quiescence?.all_writers_stopped)throw Error('Common stopped-writer cut required');
 mkdirSync(destination,{mode:0o700});const records={};
 for(const name of names){const bytes=JSON.stringify({format:'growth-private-component-1',checkpoint_id:checkpoint.id,name,data:components[name]})+'\n';writePrivate(destination+'/'+name+'.json',bytes);records[name]={file:name+'.json',sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
 const manifest={format:'growth-private-recovery-1',checkpoint,components:records},bytes=JSON.stringify(manifest,null,2)+'\n';writePrivate(destination+'/manifest.json',bytes);sync(destination);return {manifest,sha256:sha(bytes)};
}
export function verify(archive,expectedDigest){
 privatePath(archive,true);if(readdirSync(archive).sort().join()!==['manifest.json',...names.map(n=>n+'.json')].sort().join())throw Error('Incomplete or unexpected archive');
 privatePath(archive+'/manifest.json');const bytes=readFileSync(archive+'/manifest.json');if(!/^[a-f0-9]{64}$/.test(expectedDigest)||sha(bytes)!==expectedDigest)throw Error('Manifest checksum mismatch');
 const m=JSON.parse(bytes);if(m.format!=='growth-private-recovery-1'||Object.keys(m.components).sort().join()!==[...names].sort().join())throw Error('Manifest format mismatch');const result={};
 for(const name of names){const r=m.components[name];if(r.file!==name+'.json')throw Error('Invalid component path');privatePath(archive+'/'+r.file);const b=readFileSync(archive+'/'+r.file);if(sha(b)!==r.sha256||b.length!==r.bytes)throw Error('Component checksum mismatch');const v=JSON.parse(b);if(v.format!=='growth-private-component-1'||v.name!==name||v.checkpoint_id!==m.checkpoint.id)throw Error('Mixed checkpoint rejected');result[name]=v.data;}
 if(!m.checkpoint.quiescence.all_writers_stopped)throw Error('Missing quiescence');
 const a=result['publisher-journal'];if(a.format!=='growth-pilot-backup-1'||sha(a.journal)!==a.sha256)throw Error('Journal checksum mismatch');const j=JSON.parse(a.journal);if(canonical(j.bound.binding)!==canonical(m.checkpoint.binding))throw Error('Journal identity mismatch');
 const {checksum,...content}=j;if(checksum!==sha(canonical(content))||content.schema!==1||!Array.isArray(content.events)||content.events.some((e,i)=>e.seq!==i+1))throw Error('Journal sequence/checksum mismatch');
 const latest=new Map();for(const e of content.events)if(e.value?.kind==='operation')latest.set(e.value.operation.id,e.value.operation);if([...latest.values()].some(e=>!['preview','confirmed_applied','confirmed_not_applied','restored'].includes(e.state)))throw Error('Unsettled archive operation');
 const files=result['wordpress-files'].files;if(!Array.isArray(files)||files.length<4)throw Error('Required WP files missing');
 for(const f of files){if(!['mu-plugins/growth.php','themes/growth-private/style.css','themes/growth-private/index.php','themes/growth-private/functions.php'].includes(f.path)&&!/^uploads\/[a-zA-Z0-9_/-]+\.png$/.test(f.path))throw Error('Unsupported WP path');if(f.path.split('/').includes('..')||!Number.isInteger(f.mode)||(f.mode&0o7022)||sha(Buffer.from(f.data,'base64'))!==f.sha256)throw Error('WP file integrity mismatch');}
 const sqlite=result['scanner-sqlite'];if(sha(Buffer.from(sqlite.base64,'base64'))!==sqlite.sha256||sqlite.data?.integrity!=='ok')throw Error('SQLite component integrity mismatch');
 return {manifest:m,components:result};
}
export function newTarget(archive,destination,expectedDigest){
 // Validate every component before reserving the fresh target. Existing empty directories also fail closed.
 if(existsSync(destination))throw Error('Restore requires a new absent target; no destructive restore');
 const result=verify(archive,expectedDigest);mkdirSync(destination,{mode:0o700});writePrivate(destination+'/checkpoint.json',JSON.stringify(result.manifest.checkpoint)+'\n');return result;
}
export function sqliteSnapshot(source,destination){
 privatePath(source);if(existsSync(destination))throw Error('New SQLite target required');
 const script=`import sqlite3,sys,os,json,hashlib
s,d=sys.argv[1:]
a=sqlite3.connect('file:'+s+'?mode=ro',uri=True)
assert a.execute('pragma integrity_check').fetchall()==[('ok',)]
fd=os.open(d,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
b=sqlite3.connect(d);a.backup(b)
assert b.execute('pragma integrity_check').fetchall()==[('ok',)]
assert b.execute('pragma foreign_key_check').fetchall()==[]
tables=[r[0] for r in b.execute("select name from sqlite_master where type='table' order by name")]
rows={t:b.execute('select * from "'+t.replace('"','""')+'" order by rowid').fetchall() for t in tables}
print(json.dumps(dict(integrity='ok',user_version=b.execute('pragma user_version').fetchone()[0],schema=b.execute("select name,sql from sqlite_master order by name").fetchall(),rows=rows),ensure_ascii=False))
b.close();a.close()`;
 const data=JSON.parse(execFileSync('python3',['-c',script,source,destination],{encoding:'utf8',maxBuffer:32*1024*1024}));sync(destination);return {data,sha256:sha(readFileSync(destination)),base64:readFileSync(destination).toString('base64')};
}
