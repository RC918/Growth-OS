// Server-owned local volume, one process. No grant/token in the durable identity.
import {mkdirSync,readFileSync,writeFileSync,openSync,closeSync,fsyncSync,unlinkSync,lstatSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRunJournal,openRunJournal} from '../wordpress-publish/journal.mjs';
import {canonical} from '../../apps/web/first-result-payload.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const sync=p=>{const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const exclusive=(p,s)=>{const fd=openSync(p,'wx',0o600);try{writeFileSync(fd,s);fsyncSync(fd);}finally{closeSync(fd);}};
export function createStore(dir,binding){mkdirSync(dir,{mode:0o700});createRunJournal(join(dir,'journal.json'),{binding,restore:null});sync(dir);}
export function openStore(dir,binding){
 if(!lstatSync(dir).isDirectory()||lstatSync(dir).isSymbolicLink())throw Error('Private regular store directory required');
 const path=join(dir,'journal.json');if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw Error('Regular journal required');
 // Stale lock is intentionally not removed. Crash recovery needs offline reconciliation;
 // an archive can be recovered to a NEW readonly store without unlocking the old writer.
 const lock=join(dir,'writer.lock');exclusive(lock,JSON.stringify({pid:process.pid})+'\n');sync(dir);let closed=false;
 try{
  const raw=JSON.parse(readFileSync(path,'utf8')),bound=raw.bound;
  if(canonical(bound?.binding)!==canonical(binding)||!Object.hasOwn(bound,'restore')||(bound.restore!==null&&!/^[a-f0-9]{64}$/.test(bound.restore)))throw Error('Pilot durable identity mismatch');
  const journal=openRunJournal(path,bound),restored=bound.restore!==null;
  const healthy=()=>{if(closed)throw Error('Store closed');journal.assertHealthy();};
  return {restored,journal:{entries:journal.entries,assertHealthy:healthy,append(value){healthy();if(restored)throw Error('Recovered archive is readonly');journal.append(value);}},
   entries(){healthy();return openRunJournal(path,bound).entries;},
   backup(destination){healthy();openRunJournal(path,bound);const bytes=readFileSync(path,'utf8'),payload={format:'growth-pilot-backup-1',sha256:sha(bytes),journal:bytes};exclusive(destination,JSON.stringify(payload)+'\n');return {sha256:payload.sha256,records:journal.count()};},
   close(){if(!closed){closed=true;unlinkSync(lock);sync(dir);}}
  };
 }catch(e){unlinkSync(lock);sync(dir);throw e;}
}
export function restoreBackup(archive,destination,binding){
 if(existsSync(destination))throw Error('Restore requires a new directory');
 if(!lstatSync(archive).isFile()||lstatSync(archive).isSymbolicLink()||lstatSync(archive).size>40*1024*1024)throw Error('Invalid archive');
 const a=JSON.parse(readFileSync(archive,'utf8'));
 if(Object.keys(a).sort().join(',')!=='format,journal,sha256'||a.format!=='growth-pilot-backup-1'||typeof a.journal!=='string'||sha(a.journal)!==a.sha256)throw Error('Archive checksum mismatch');
 const source=JSON.parse(a.journal);if(canonical(source.bound?.binding)!==canonical(binding))throw Error('Archive identity mismatch');
 mkdirSync(destination,{mode:0o700});const path=join(destination,'journal.json');const sourcePath=join(destination,'source.json');exclusive(sourcePath,a.journal);
 const original=openRunJournal(sourcePath,source.bound); // Validate all sequence/checksum before conversion.
 const next=path;createRunJournal(next,{binding,restore:a.sha256});const recovered=openRunJournal(next,{binding,restore:a.sha256});
 for(const value of original.entries)recovered.append(value);
 // Keep the original snapshot for audit. No in-place recovery of a writable store.
 sync(destination);
 return {sha256:a.sha256,records:original.count(),mode:'readonly'};
}
// Synchronous filesystem operations are bounded by the 32 MiB journal limit.
