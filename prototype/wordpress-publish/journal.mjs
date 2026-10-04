// Single-writer, same-run snapshot of the existing journal. No token or grant storage.
import {openSync,writeFileSync,readFileSync,fsyncSync,closeSync,renameSync,existsSync,statSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical} from '../../apps/web/first-result-payload.mjs';
const MAX=32*1024*1024;
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const syncDir=path=>{const fd=openSync(dirname(path),'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const encode=(bound,events)=>{const content={schema:1,bound,events};return JSON.stringify({...content,checksum:digest(content)})+'\n';};
function writeExclusive(path,bytes){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
export function createRunJournal(path,bound){writeExclusive(path,encode(bound,[]));syncDir(path);}
export function openRunJournal(path,expected){
 if(existsSync(path+'.next'))throw Error('Incomplete journal commit; no automatic repair');
 if(statSync(path).size>MAX)throw Error('Journal limit');
 const bytes=readFileSync(path,'utf8');if(!bytes.endsWith('\n'))throw Error('Incomplete journal record');
 let snapshot;try{snapshot=JSON.parse(bytes);}catch{throw Error('Corrupt journal JSON');}
 const {checksum,...content}=snapshot;
 if(content.schema!==1||canonical(content.bound)!==canonical(expected)||checksum!==digest(content)||!Array.isArray(content.events)||Object.keys(content).sort().join(',')!=='bound,events,schema')throw Error('Journal integrity / run binding mismatch');
 content.events.forEach((e,n)=>{if(e.seq!==n+1||Object.keys(e).sort().join(',')!=='seq,value'||!e.value||typeof e.value!=='object')throw Error('Incomplete journal sequence');});
 let events=content.events,blocked=false;
 return {
  entries:structuredClone(events.map(e=>e.value)),
  assertHealthy(){if(blocked)throw Error('Journal commit uncertain; restart and reconcile only');},
  append(value){
   this.assertHealthy();
   const next=[...events,{seq:events.length+1,value:structuredClone(value)}],bytes=encode(expected,next);if(Buffer.byteLength(bytes)>MAX)throw Error('Journal limit');
   try{writeExclusive(path+'.next',bytes);renameSync(path+'.next',path);syncDir(path);events=next;}catch(error){blocked=true;throw error;}
  },
  count(){return events.length;}
 };
}
