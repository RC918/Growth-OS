import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {digest} from '../../apps/web/intro-candidate.mjs';
import {TRIAL,CAP_NUSD,payload,EXECUTOR} from './policy.mjs';
export const OLD_ROOT='/workspace/intro-trial-state/INTRO-TRIAL-01';
export const NEW_ROOT='/workspace/intro-trial-state/INTRO-TRIAL-01-R2';
export const OLD_RESERVED_AT=Date.parse('2026-10-09T03:14:56.418Z');
// No writes, locks, migration, preparation or repair in the old ledger.
export async function priorReservation(root,activation,manifest){
 if(!(await lstat(root)).isDirectory())throw Error('PRIOR_RESERVATION_UNVERIFIED');
 for(const name of ['journal.jsonl','manifest.json','created.once'])if(!(await lstat(join(root,name))).isFile())throw Error('PRIOR_RESERVATION_UNVERIFIED');
 const raw=await readFile(join(root,'journal.jsonl'));
 const hash=createHash('sha256').update(raw).digest('hex');
 if(hash!==activation.priorJournalSha256||!raw.toString('utf8').endsWith('\n'))throw Error('PRIOR_RESERVATION_UNVERIFIED');
 const events=raw.toString('utf8').trim().split('\n').map(JSON.parse),[init,reserved,stop]=events;
 const manifestHash=await digest(manifest);
 if(events.length!==3||init.type!=='initialized'||init.trial!==TRIAL||init.execution_task_id!==EXECUTOR||init.manifest_hash!==manifestHash||reserved.type!=='reserved'||reserved.kind!=='generate'||reserved.case_id!=='public-intro'||reserved.request_id!==TRIAL+'-1'||reserved.max_nusd!==CAP_NUSD||reserved.at!==OLD_RESERVED_AT||reserved.payload_hash!==await digest(payload(manifest.cases[0].source))||stop.type!=='UNKNOWN_STOP'||stop.request_id!==reserved.request_id||stop.calls!==1||stop.held_nusd!==CAP_NUSD)throw Error('PRIOR_RESERVATION_UNVERIFIED');
 if(await digest(JSON.parse(await readFile(join(root,'manifest.json'),'utf8')))!==manifestHash||await readFile(join(root,'created.once'),'utf8')!==TRIAL+'\n')throw Error('PRIOR_RESERVATION_UNVERIFIED');
 return {trial:TRIAL,request_id:reserved.request_id,journal_sha256:hash,execution_task_id:EXECUTOR,state:'UNKNOWN_STOP',held_nusd:CAP_NUSD,calls:1};
}
