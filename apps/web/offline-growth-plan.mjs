import {intakeFields} from './goal-intake.mjs';
import {createGrowthPlan} from './growth-plan-contract.mjs';
import {createGrowthPlanSession} from './growth-plan-session.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const context={organizationId:'93a88055-0a0b-40c0-b22f-a6d312320001',goalId:'5055ca31-40cc-435d-9f52-cdf19166440c',role:'owner',sessionId:'offline-synthetic'};
const turns=[{version_number:1,question_key:'goal',answer_text:'合成案例：讓海外採購找到工業零件'}];
for(const field of intakeFields)turns.push({version_number:turns.length+1,question_key:field.key,answer_text:'合成：'+field.label});
turns.push({version_number:8,question_key:'confirm',answer_text:'確認'});
const card={id:'draft',title:'整理產品搜尋草稿',deliverable:'產品標題與描述預覽（尚未生成）',dependsOn:[],missingInputs:[],evidence:[{turnVersion:1,quote:'工業零件'}]};
const session=createGrowthPlanSession({getContext:()=>context,getTurns:()=>turns});
session.open(createGrowthPlan({id:'f709d43d-12be-4dc2-8833-aa6d8e96cf01',context,turns,cards:[card]}));
const labels={draft:'待確認',ready:'待開始',running:'模擬進行中',completed:'內部模擬完成',failed:'模擬失敗'};
const errors={INVALID_CARD_DEPENDENCY:'請填寫 1 到 2000 字的交付物。',RESULT_REQUIRED:'請提供內部結果的位置或紀錄。',FAILURE_REASON_REQUIRED:'請提供失敗原因，再明確重試。',STATE_VERSION_CONFLICT:'狀態已變更，請查看最新紀錄後再操作。',PLAN_VERSION_CONFLICT:'計畫版本已變更，請查看最新版本。'};
function expected(){const p=session.view().plan;return {expectedVersion:p.version,expectedStateRevision:p.stateRevision};}
function report(message,error=false){$('plan-feedback').textContent=message;$('plan-feedback').classList.toggle('error',error);}
function dirty(){return $('plan-deliverable').value!==session.view().plan.cards[0].deliverable;}
function render(reset=false){
 const v=session.view(),p=v.plan,c=p.cards[0];if(reset)$('plan-deliverable').value=c.deliverable;
 $('plan-source').textContent=turns[0].answer_text+' · 來源版本 1，合成確認版本 8';
 $('plan-current').replaceChildren(node('h2',`計畫版本 ${p.version} · ${labels[c.status]}`),node('p',c.title),node('p',c.deliverable),node('p','來源引用：「'+c.evidence[0].quote+'」'),node('p','下一步：'+(dirty()?'先建立修訂版本並重新確認。':p.status==='draft'?'檢查交付物，再確認目前計畫。':c.status==='ready'||c.status==='failed'?'可模擬開始工作。':c.status==='running'?'填寫結果位置或失敗原因。':'查看紀錄，或修訂計畫。')));
 const edited=dirty();$('plan-approve').disabled=edited||p.status!=='draft';$('plan-start').disabled=edited||p.status!=='approved'||!['ready','failed'].includes(c.status);
 $('plan-complete').disabled=edited||c.status!=='running';$('plan-fail').disabled=edited||c.status!=='running';
 $('plan-history').replaceChildren(...v.events.map(e=>{const row=node('article','');row.className='observation-version';row.append(node('h3',`紀錄 ${e.sequence} · 計畫版本 ${e.plan.version} · ${labels[e.plan.cards[0].status]}`),node('p',e.plan.cards[0].deliverable));if(e.plan.cards[0].result)row.append(node('p',e.plan.cards[0].result));return row;}));
}
function run(operation,message,reset=false){try{operation();render(reset);report(message);}catch(e){report(errors[e.message]||'操作未完成，請檢查目前計畫。',true);} $('plan-feedback').focus();}
$('plan-deliverable').addEventListener('input',()=>{render();report('修改尚未保存；先建立修訂版本再重新確認。');});
$('plan-revise').addEventListener('click',()=>run(()=>session.revise({...expected(),cards:[{...session.view().plan.cards[0],deliverable:$('plan-deliverable').value}]}),'已建立新的待確認版本；舊版本及結果保留。',true));
$('plan-cancel').addEventListener('click',()=>{render(true);report('未保存修改已捨棄，既有版本保留。');});
$('plan-approve').addEventListener('click',()=>run(()=>session.approve(expected()),'目前計畫已確認，尚未開始工作或發布。'));
$('plan-start').addEventListener('click',()=>run(()=>session.transition({...expected(),cardId:'draft',status:'running'}),'本頁模擬工作已開始；沒有執行外部操作。'));
for(const [id,status] of [['plan-complete','completed'],['plan-fail','failed']])$(id).addEventListener('click',()=>run(()=>session.transition({...expected(),cardId:'draft',status,result:$('plan-result').value}),status==='completed'?'已記錄內部模擬結果；尚未發布，也沒有流量成效。':'已記錄模擬失敗原因；可明確重試。'));
render(true);report('先檢查交付物，再確認目前計畫。');
