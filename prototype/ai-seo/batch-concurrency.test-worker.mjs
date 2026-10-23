// Test-only IPC worker: real filesystem ledger, synthetic values, no provider calls.
import {openBatchLedger} from './batch-authorization.mjs';
const [file,repoRoot]=process.argv.slice(2);
const ledger=openBatchLedger({file,repoRoot});
const state=()=>{
 const s=ledger.snapshot();
 return Object.fromEntries(['status','max_attempts','budget_cap_usd','attempts_used',
  'attempts_pending','pending_run_id','known_cost_usd','pending_cost_usd','unknown_cost_attempts'].map(k=>[k,s[k]]));
};
process.on('message',({id,operation})=>{
 if(operation==='close'){process.disconnect();return;}
 const before=state();
 try{
  if(operation==='reserve')ledger.reserveAttempt({estimatedCostUsd:0.0001});
  else if(operation==='settle')ledger.settleRun({attemptCount:1,knownCostDelta:0.0001,reservedCostUsd:0.0001});
  else throw Error('UNEXPECTED_TEST_OPERATION:'+operation);
  process.send({id,operation,ok:true,before,after:state()});
 }catch(error){
  // The parent must assert the exact expected refusal and unchanged accounting.
  // Unexpected errors fail the test with their original stack; none are discarded.
  process.send({id,operation,ok:false,before,after:state(),
   error:{name:error.name,message:error.message,stack:error.stack}});
 }
});
process.send({ready:true});
