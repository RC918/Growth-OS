import {preview, compare} from './search-baseline.mjs';
import {saveSnapshot,loadSnapshot} from './baseline-snapshot.mjs';
import {growthReport} from './baseline-report.mjs';
import {validateActions} from './baseline-actions.mjs';
let actions=[],actionsVersion=0;
let report=null;
const data = {a: null, b: null}, synthetic = {a: false, b: false}, versions = {a: 0, b: 0};
const $ = id => document.getElementById(id);
const number = value => value.toLocaleString('zh-TW');
function node(tag, text, className) {const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element;}
function clearComparison() { $('comparison').hidden = true; $('comparison-error').textContent = ''; $('compare').disabled = !data.a || !data.b; $('save-snapshot').disabled = !data.a; $('build-report').disabled = !data.a; report=null; $('download-report').disabled=true; $('report-result').hidden=true; $('report-error').textContent=''; }
function invalidate(key) {data[key] = null; synthetic[key] = false; versions[key]++; $('result-' + key).hidden = true; $('error-' + key).textContent = ''; clearComparison();}
function reveal(element) {element.hidden = false; element.focus({preventScroll: true}); element.scrollIntoView({behavior: 'smooth', block: 'nearest'});}
function render(key, result) {
  const target = $('result-' + key); target.replaceChildren();
  target.append(node('h3', synthetic[key] ? '合成範例 · 預覽結果' : '你提供的資料 · 預覽結果'));
  target.append(node('p', `${result.origin} · ${result.start} 至 ${result.end} · ${result.days} 天`, 'muted'));
  const metrics = node('div', '', 'metrics');
  for (const [label, value] of [['已觀察點擊',number(result.clicks)],['已觀察曝光',number(result.impressions)],['已觀察點擊率',result.ctr === null ? '無法計算' : (result.ctr * 100).toFixed(2) + '%']]) {
    const item = node('div', '', 'metric'); item.append(node('span',label),node('strong',value)); metrics.append(item);
  }
  target.append(metrics, node('p', result.complete ? `日期完整：${result.rows.length} / ${result.days} 天。` : `缺少 ${result.missing.length} 天：加總只涵蓋已提供資料，不能代表整段期間。`, result.complete ? 'complete' : 'warning'));
  if (result.missing.length) target.append(node('p', '未知日期：' + result.missing.join('、'), 'small'));
  const details = document.createElement('details'); details.append(node('summary','查看每日資料'));
  const table = document.createElement('table'); const head = document.createElement('thead'); const hr = document.createElement('tr'); ['日期','點擊','曝光'].forEach(x=>hr.append(node('th',x))); head.append(hr); table.append(head);
  const body = document.createElement('tbody'); result.rows.forEach(row=>{const tr = document.createElement('tr'); [row.date,number(row.clicks),number(row.impressions)].forEach(x=>tr.append(node('td',x))); body.append(tr);}); table.append(body); details.append(table); target.append(details); reveal(target);
}
for (const key of ['a','b']) {
  const form = $('form-' + key);
  form.addEventListener('input',()=>invalidate(key));
  form.elements.file.addEventListener('change', async () => {
    invalidate(key); const version = versions[key]; const file = form.elements.file.files[0]; if (!file) return;
    form.elements.csv.value = '';
    try {
      if (file.size > 1000000) throw new Error('檔案超過 1 MB，請縮小日期範圍。');
      const text = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      if (version !== versions[key]) return;
      form.elements.csv.value = text;
    } catch {if (version === versions[key]) $('error-' + key).textContent = file.size > 1000000 ? '檔案超過 1 MB，請縮小日期範圍。' : '無法讀取檔案，請使用 UTF-8 CSV。';}
  });
  form.addEventListener('submit',event=>{
    event.preventDefault(); data[key] = null; clearComparison(); $('error-' + key).textContent = ''; $('result-' + key).hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      data[key] = preview(values.csv, values); render(key,data[key]); clearComparison();
    } catch (error) {$('error-' + key).textContent = error.message; $('error-' + key).scrollIntoView({behavior:'smooth',block:'nearest'});}
  });
  document.querySelector(`[data-sample="${key}"]`).addEventListener('click',()=>{
    invalidate(key); synthetic[key] = true;
    const start = key === 'a' ? '01' : '04', end = key === 'a' ? '03' : '06';
    const sample = {origin:'https://shop.example',type:'web',start:`2026-09-${start}`,end:`2026-09-${end}`,exported:'2026-09-07T09:00:00+08:00',csv: key === 'a' ? 'date,clicks,impressions\n2026-09-01,2,10\n2026-09-02,0,0\n2026-09-03,1,10' : 'date,clicks,impressions\n2026-09-04,3,20\n2026-09-05,0,0\n2026-09-06,2,10'};
    Object.entries(sample).forEach(([name,value])=>form.elements[name].value=value); form.elements.file.value=''; form.requestSubmit();
  });
}
$('compare').addEventListener('click',()=>{
  $('comparison-error').textContent = ''; $('comparison').hidden = true;
  try {
    const result = compare(data.a,data.b); const target = $('comparison'); target.replaceChildren();
    target.append(node('h3',synthetic.a && synthetic.b ? '合成範例 · 期間差異' : '觀察到的期間差異'));
    const signed = n => (n > 0 ? '+' : '') + number(n);
    target.append(node('p',`點擊 ${signed(result.clickDifference)} · 曝光 ${signed(result.impressionDifference)}`, 'difference'),node('p','這是觀察值的差額，不能據此認定內容或行銷措施造成成長。','muted')); reveal(target);
  } catch (error) {$('comparison-error').textContent = error.message;}
});

$('save-snapshot').addEventListener('click',()=>{
  $('snapshot-feedback').classList.remove('success'); $('snapshot-feedback').textContent='';
  try {
    const text=saveSnapshot(data.a,data.b,synthetic,actions);
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download='growth-os-search-baseline.json'; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  } catch(error) {$('snapshot-feedback').textContent=error.message;}
});
$('snapshot-file').addEventListener('change',async()=>{
  invalidate('a'); invalidate('b'); $('snapshot-feedback').classList.remove('success'); $('snapshot-feedback').textContent='';
  const file=$('snapshot-file').files[0], versionA=versions.a, versionB=versions.b,versionActions=actionsVersion;
  if(!file) return;
  try {
    if(file.size>1000000) throw new Error('保存檔超過 1 MB。');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
    if(versionA!==versions.a || versionB!==versions.b || versionActions!==actionsVersion) return;
    const loaded=loadSnapshot(text);
    actions=loaded.actions; actionsVersion++; $('action-form').reset(); renderActions();
    for(const key of ['a','b']) {
      const form=$('form-'+key), value=loaded[key];
      form.reset();
      if(!value) continue;
      Object.entries(value.meta).forEach(([name,item])=>form.elements[name].value=item);
      form.elements.csv.value=value.csv; synthetic[key]=value.sample; data[key]=value.result; render(key,value.result);
    }
    $('second').open=Boolean(loaded.b); clearComparison();
    $('snapshot-feedback').classList.add('success'); $('snapshot-feedback').textContent='已重新驗證並載入。請重新按「比較兩段期間」查看差異；來源資訊仍未核實。';
    $('snapshot-feedback').scrollIntoView({behavior:'smooth',block:'nearest'});
  } catch(error) {if(versionA===versions.a && versionB===versions.b && versionActions===actionsVersion) $('snapshot-feedback').textContent=error.message;}
});

$('build-report').addEventListener('click',()=>{
  $('report-error').textContent='';
  try {
    report=growthReport(data.a,data.b,synthetic,actions);
    const target=$('report-result'); target.replaceChildren(node('h3',report.title));
    const summary=node('section','','report-summary'); summary.setAttribute('aria-label','判讀摘要');
    summary.append(node('h4',report.summary.label),node('p',report.summary.detail),node('p',report.summary.provenance,'small'),node('p',`優先下一步：${report.summary.nextStep}`,'summary-next'));
    target.append(summary);
    const grid=node('div','','report-grid');
    for(const [heading,items] of report.sections) {
      const section=node('section','','report-section'); section.append(node('h4',heading));
      const list=document.createElement('ul'); items.forEach(text=>list.append(node('li',text))); section.append(list); grid.append(section);
    }
    target.append(grid); $('download-report').disabled=false; reveal(target);
  } catch(error) {$('report-error').textContent=error.message;}
});
$('download-report').addEventListener('click',()=>{
  if(!report) return;
  const url=URL.createObjectURL(new Blob([report.markdown],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a'); link.href=url; link.download='growth-os-observation-report.md'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
});

function renderActions() {
  const list=$('action-list'); list.replaceChildren();
  if(!actions.length) {list.append(node('li','尚未加入發布紀錄。','muted')); return;}
  actions.forEach((action,index)=>{
    const item=node('li','','action-item'); item.append(node('span',`${action.date} · ${action.path} · ${action.note}`));
    const remove=node('button','移除','secondary'); remove.type='button'; remove.setAttribute('aria-label',`移除 ${action.date} ${action.path}`);
    remove.addEventListener('click',()=>{actions.splice(index,1); actionsVersion++; renderActions(); clearComparison();}); item.append(remove); list.append(item);
  });
}
$('action-form').addEventListener('submit',event=>{
  event.preventDefault(); $('action-error').textContent='';
  try {
    const action=Object.fromEntries(new FormData(event.currentTarget));
    actions=validateActions([...actions,action]); actionsVersion++; renderActions(); clearComparison(); event.currentTarget.reset();
  } catch(error) {$('action-error').textContent=error.message;}
});
renderActions();
