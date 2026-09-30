import {intakeState,intakeFields} from './goal-intake.mjs';
export function createGoalPanel(api,root=document.getElementById('goal-panel')) {
  let generation=0,selection=0,role=null,goals=[],goalId=null,turns=[],pending=null,editing=null,locked=false;
  const node=(tag,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
  const feedback=node('p','','notice');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const content=node('div');root.append(feedback,content);
  function report(text){feedback.textContent=text;}
  function controls(disabled){locked=disabled;for(const el of content.querySelectorAll('button,textarea,select'))el.disabled=disabled;}
  function render() {
    const state=intakeState(turns);content.replaceChildren();
    const actions=node('div','','actions');
    const reload=node('button','重新讀取目標','quiet');reload.type='button';reload.addEventListener('click',()=>void run(async()=>{const current=generation;await load();if(current===generation)report('已重新讀取保存資料。');}));actions.append(reload);
    if(role==='owner') {const fresh=node('button','新增目標','secondary');fresh.type='button';fresh.addEventListener('click',()=>{selection++;goalId=null;turns=[];pending=null;editing=null;report('既有目標仍保留。');render();});actions.append(fresh);}
    content.append(actions);
    if(goals.length) {
      const label=node('label','最近保存的目標');const select=node('select');select.id='goal-select';
      const empty=node('option','選擇目標');empty.value='';select.append(empty);
      for(const goal of goals) {const option=node('option',`${goal.created_at} · ${goal.id.slice(0,8)}`);option.value=goal.id;select.append(option);}
      select.value=goalId||'';select.addEventListener('change',()=>{const id=select.value;if(id)void run(async()=>{const current=generation;await read(id);if(current===generation)report('已讀取保存的目標與問答。');});});label.append(select);content.append(label,node('p','顯示最近 20 個目標；較早的目標仍保存在工作區，歷史分頁尚待開發。','hint'));
    }
    if(turns.length) {
      content.append(node('h3',state.goal));
      const summary=node('dl');
      for(const field of intakeFields) if(state.answers[field.key]) {
        summary.append(node('dt',field.label));const value=node('dd',state.answers[field.key]);
        if(role==='owner') {const edit=node('button',`修正${field.label}`,'quiet');edit.type='button';edit.addEventListener('click',()=>{editing=field;pending=null;render();content.querySelector('textarea')?.focus();});value.append(edit);}
        summary.append(value);
      }
      content.append(summary,node('p',state.confirmed?'資料已確認 · 待建立成長計畫':'資料收集中 · 尚未建立成長計畫','pill'));
      const history=node('details');history.append(node('summary',`問答與修正紀錄（${turns.length} 筆）`));
      for(const turn of turns)history.append(node('p',`${turn.version_number}. ${turn.question_text}`),node('p',turn.answer_text));content.append(history);
    }
    if(role!=='owner') {content.append(node('p','你有檢視權限；只有企業擁有者可以提出或修正目標。','hint'));controls(locked);return;}
    const question=editing||state.next;
    if(!question){controls(locked);return;}
    if(state.version>=200){content.append(node('p','此目標已達 200 筆紀錄上限；既有資料仍保留，請新增目標。','hint'));controls(locked);return;}
    const form=node('form');form.id='goal-form';form.className='fields';const label=node('label',question.question);
    const input=node('textarea');input.name='answer';input.maxLength=2000;input.required=true;
    if(question.key!=='confirm') {input.value=editing?state.answers[editing.key]:'';label.append(input);}form.append(label);
    const save=node('button',question.key==='confirm'?'確認資料':state.version?'保存回答':'保存目標','primary');save.type='submit';form.append(save);
    if(editing) {const cancel=node('button','取消修正','quiet');cancel.type='button';cancel.addEventListener('click',()=>{editing=null;pending=null;render();});form.append(cancel);}
    form.addEventListener('submit',event=>{
      event.preventDefault();if(locked)return;
      const answer=question.key==='confirm'?'確認':input.value.trim();if(!answer){report('請填寫目標或回答。');return;}
      if(!goalId)goalId=crypto.randomUUID();
      const signature=JSON.stringify([goalId,state.version,question.key,answer]);
      if(pending?.signature!==signature)pending={signature,goalId,requestId:crypto.randomUUID(),expectedVersion:state.version,questionKey:question.key,answer};
      const session=generation;const submission={...pending};
      void run(async()=>{
        const result=await api.saveGoalTurn(submission);
        if(session!==generation)return;
        if(result.goal_id!==goalId)throw new Error('保存結果不一致，請重新讀取');
        await read(goalId);if(session!==generation)return;await loadList();if(session!==generation)return;pending=null;editing=null;render();
        report('已保存並讀回問答；尚未發布或取得成長數據。');
      });
    });content.append(form);controls(locked);
  }
  async function loadList(){const current=generation;const next=await api.listGoals();if(current!==generation)return;goals=next;}
  async function read(id){const current=generation;const ticket=++selection;const next=await api.readGoal(id);if(current!==generation||ticket!==selection)return;intakeState(next);goalId=id;turns=next;editing=null;render();}
  async function load(){const current=generation;await loadList();if(current!==generation)return;if(goals.length)await read(goalId&&goals.some(goal=>goal.id===goalId)?goalId:goals[0].id);else render();}
  async function run(operation) {
    if(locked)return;const current=generation;controls(true);report('讀取或保存中…');
    try{await operation();}catch(error){if(current===generation)report(`${error.message}。已保存的問答仍保留；可重試或重新讀取。若登入逾時，請重新登入。`);}
    finally{if(current===generation)controls(false);}
  }
  return {
    async open(nextRole){generation++;selection++;role=nextRole;goals=[];goalId=null;turns=[];pending=null;editing=null;locked=false;render();await run(load);},
    close(){generation++;selection++;role=null;goals=[];goalId=null;turns=[];pending=null;editing=null;locked=false;content.replaceChildren();report('');},
  };
}
