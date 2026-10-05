// Explicit test doubles: no natural-language engine, remote API or persisted data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInferenceProposal,prepareConfirmedIntakeTurn} from './goal-inference-contract.mjs';
import {intakeState,intakeFields} from '../../apps/web/goal-intake.mjs';
const org='11111111-1111-4111-8111-111111111111',goal='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const turn=(version,key,answer)=>({organization_id:org,goal_id:goal,version_number:version,question_key:key,answer_text:answer});
const snapshot=()=>({organizationId:org,goalId:goal,role:'owner',turns:[turn(1,'goal','讓海外買家找到我的零件；目前尚無連結')]});
// Handwritten proposal only: source quote existence does not prove its inference.
const double=(s=snapshot())=>({contract_version:1,operation:'propose_intake_fields',organization_id:org,goal_id:goal,
 expected_version:s.turns.length,fields:[{key:'offering',value:'零件',source_refs:[{turn_version:1,quote:'我的零件'}]}],
 missing_fields:['audience','market','channel','asset','metric']});
const receipt=(p)=>({proposal_id:p.proposal_id,expected_version:p.expected_version,confirmed:true});
const reject=(edit,pattern)=>{const s=snapshot(),p=double(s);edit(p,s);assert.throws(()=>validateInferenceProposal(p,s),pattern);};

test('handwritten double has verifiable source, complete missing list and no verified AI or saved status',()=>{
 const s=snapshot(),before=structuredClone(s),p=double(),result=validateInferenceProposal(p,s);
 assert.equal(result.status,'awaiting_user_confirmation');assert.equal(result.inference_verified,false);
 assert.deepEqual(result.missing_fields,['audience','market','channel','asset','metric']);
 assert.deepEqual(s,before);assert.ok(Object.isFrozen(result.fields[0].source_refs[0]));
 p.fields[0].value='後改';assert.equal(result.fields[0].value,'零件');
});
test('unknown or duplicate fields, unexpected properties and privileged operations are refused',()=>{
 for(const op of ['save_goal_turn','confirm','publish','execute_sql'])reject(p=>p.operation=op,/OPERATION/);
 reject(p=>p.fields[0].key='organization_id',/FIELD/);reject(p=>p.fields.push({...p.fields[0]}),/FIELD/);
 reject(p=>p.fields[0].confidence=1,/SHAPE/);reject(p=>p.confirmed=true,/SHAPE/);
 reject(p=>p.fields[0].value=' '.repeat(2),/TEXT/);reject(p=>p.fields[0].value='a'.repeat(2001),/TEXT/);
 reject(p=>p.contract_version=2,/OPERATION/);
});
test('unverifiable, missing, duplicate and unrelated source quotes are rejected',()=>{
 reject(p=>p.fields[0].source_refs=[],/SOURCE_REQUIRED/);
 reject(p=>p.fields[0].source_refs[0].quote='捏造的網站',/UNVERIFIABLE/);
 reject(p=>p.fields[0].source_refs[0].turn_version=2,/UNVERIFIABLE/);
 reject(p=>p.fields[0].source_refs.push({...p.fields[0].source_refs[0]}),/DUPLICATE_SOURCE/);
 reject((p,s)=>{s.turns.push(turn(2,'offering','零件'),turn(3,'audience','海外買家'));p.expected_version=3;
 p.fields[0].source_refs=[{turn_version:3,quote:'海外買家'}];},/UNVERIFIABLE/);
});
test('missing data is explicit; no-link remains an answer and cannot be invented or omitted',()=>{
 reject(p=>p.missing_fields.pop(),/MISSING_FIELDS/);
 reject(p=>p.missing_fields.push('audience'),/MISSING_FIELDS/);
 reject(p=>p.missing_fields.push('offering'),/MISSING_FIELDS/);
 const s=snapshot(),p=double(s);p.fields.push({key:'asset',value:'尚無連結',source_refs:[{turn_version:1,quote:'尚無連結'}]});
 p.missing_fields=p.missing_fields.filter(k=>k!=='asset');assert.ok(!validateInferenceProposal(p,s).missing_fields.includes('asset'));
 p.fields=[];p.missing_fields=intakeFields.map(f=>f.key);assert.equal(validateInferenceProposal(p,s).fields.length,0);
});
test('unconfirmed or content-modified proposal never yields a save intent',()=>{
 const s=snapshot(),raw=double(s),p=validateInferenceProposal(raw,s),yes=receipt(p);
 for(const no of [null,{...yes,confirmed:false},{...yes,confirmed:'true'},{...yes,proposal_id:'wrong'},
 {...yes,expected_version:0},{...yes,operation:'save'}])
 assert.throws(()=>prepareConfirmedIntakeTurn(raw,s,no,'offering',request),/CONFIRMATION/);
 raw.fields[0].value='推論改變';assert.throws(()=>prepareConfirmedIntakeTurn(raw,s,yes,'offering',request),/CONFIRMATION/);
});
test('owner-only intent follows existing guided append order; viewer/editor and cross-tenant context fail',()=>{
 const s=snapshot(),raw=double(s),p=validateInferenceProposal(raw,s);
 assert.deepEqual(prepareConfirmedIntakeTurn(raw,s,receipt(p),'offering',request),
 {goalId:goal,requestId:request,expectedVersion:1,questionKey:'offering',answer:'零件',requiresGoalReconfirmation:true});
 for(const role of ['viewer','editor'])assert.throws(()=>prepareConfirmedIntakeTurn(raw,{...s,role},receipt(p),'offering',request),/OWNER/);
 reject(p=>p.organization_id=goal,/SCOPE/);reject(p=>p.goal_id=org,/SCOPE/);
 reject((p,s)=>s.turns[0].organization_id=goal,/SOURCE_SCOPE/);
 assert.throws(()=>prepareConfirmedIntakeTurn(raw,s,receipt(p),'confirm',request),/INTAKE_ORDER/);
 const future=double(s);future.fields=[{key:'market',value:'海外',source_refs:[{turn_version:1,quote:'海外'}]}];
 future.missing_fields=['offering','audience','channel','asset','metric'];
 assert.throws(()=>prepareConfirmedIntakeTurn(future,s,receipt(validateInferenceProposal(future,s)),'market',request),/INTAKE_ORDER/);
});
test('version drift or same-version source rewrite invalidates proposal confirmation; accepted append requires fresh review',()=>{
 const s=snapshot(),raw=double(s),yes=receipt(validateInferenceProposal(raw,s));
 const changed={...s,turns:[...s.turns,turn(2,'offering','零件')]};
 assert.throws(()=>prepareConfirmedIntakeTurn(raw,changed,yes,'offering',request),/VERSION_DRIFT/);
 const newer=double(changed);newer.missing_fields=['audience','market','channel','asset','metric'];
 assert.throws(()=>prepareConfirmedIntakeTurn(newer,changed,yes,'offering',request),/CONFIRMATION/);
 const rewritten=structuredClone(s);rewritten.turns[0].answer_text+='新增';
 assert.throws(()=>prepareConfirmedIntakeTurn(raw,rewritten,yes,'offering',request),/CONFIRMATION/);
});
test('correction of confirmed goal appends a version and requires goal reconfirmation',()=>{
 const s=snapshot();for(const f of intakeFields)s.turns.push(turn(s.turns.length+1,f.key,f.key==='asset'?'尚無連結':f.label));
 s.turns.push(turn(8,'confirm','確認'));assert.equal(intakeState(s.turns).confirmed,true);
 const raw={...double(s),fields:[{key:'audience',value:'海外買家',source_refs:[{turn_version:1,quote:'海外買家'}]}],missing_fields:[]};
 const intent=prepareConfirmedIntakeTurn(raw,s,receipt(validateInferenceProposal(raw,s)),'audience',request);
 assert.equal(intent.expectedVersion,8);assert.equal(intent.requiresGoalReconfirmation,true);
 const next=[...s.turns,turn(9,intent.questionKey,intent.answer)];
 assert.equal(intakeState(next).confirmed,false);assert.equal(intakeState(next).next.key,'confirm');
 assert.equal(s.turns[2].answer_text,'目標受眾');assert.equal(s.turns.length,8);
 raw.fields[0].source_refs=[{turn_version:8,quote:'確認'}];assert.throws(()=>validateInferenceProposal(raw,s),/UNVERIFIABLE/);
});

test('malformed history, noninteger versions, overlong inputs and invalid append IDs fail closed',()=>{
 reject(p=>p.expected_version=1.5,/VERSION_DRIFT/);
 reject(p=>p.fields[0].source_refs[0].turn_version='1',/INVALID_SOURCE/);
 reject((p,s)=>s.turns[0].version_number=2,/不完整/);
 reject((p,s)=>s.turns[0].answer_text='a'.repeat(2001),/INVALID_TEXT/);
 reject((p,s)=>s.role='service_role',/INVALID_CONTEXT/);
 const s=snapshot(),p=double(s),yes=receipt(validateInferenceProposal(p,s));
 assert.throws(()=>prepareConfirmedIntakeTurn(p,s,yes,'offering','not-a-uuid'),/INVALID_REQUEST_ID/);
 for(let version=2;version<=200;version++)s.turns.push(turn(version,'offering','零件'));
 const capped=double(s),approved=receipt(validateInferenceProposal(capped,s));
 assert.throws(()=>prepareConfirmedIntakeTurn(capped,s,approved,'offering',request),/HISTORY_LIMIT/);
});

test('sparse arrays and accessor-backed output cannot bypass per-element checks',()=>{
 reject(p=>{p.fields=Array(1);p.missing_fields=intakeFields.map(f=>f.key);},/INVALID_FIELDS/);
 reject(p=>p.fields[0].source_refs=Array(1),/SOURCE_REQUIRED/);
 reject(p=>p.missing_fields=Array(5),/INVALID_FIELDS/);
 reject((p,s)=>s.turns=Array(1),/INVALID_CONTEXT/);
 let invoked=false;const p=double();
 Object.defineProperty(p.fields[0],'value',{get(){invoked=true;return '零件';},enumerable:true});
 assert.throws(()=>validateInferenceProposal(p,snapshot()),/INVALID_SHAPE/);assert.equal(invoked,false);
});
