import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {nativeFixture} from './native-fixture.mjs';
import {recoveryChecks} from './verification.mjs';
import {verifyUI} from '../theme/verification.mjs';
if(process.argv.length!==4||process.argv[2]!=='--mode'||process.argv[3]!=='growth-os-private-recovery-regression')throw Error('Explicit disposable recovery mode required');
const run='growth-recovery-'+randomUUID(),report={run,base:'f08c30d748bf73bbf9ab96496f428fa23bc12abb',started_at:new Date().toISOString(),scope:'local native synthetic only; no hosted projects or RC artifacts',results:[]};
try{for(const width of [1280,390]){let source;try{source=await nativeFixture();report.results.push(...await verifyUI({...source,run,widths:[width],recoveryHook:recoveryChecks(source)}));}finally{await source?.close();}}report.result='PASS';}catch(e){report.result='FAIL';report.failure=e.stack;process.exitCode=1;}finally{report.finished_at=new Date().toISOString();const text=JSON.stringify(report,null,2)+'\n';assert.doesNotMatch(text,/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);await writeFile('/tmp/'+run+'-evidence.json',text,{mode:0o600});console.log(text);}
