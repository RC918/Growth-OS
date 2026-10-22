// Builds the standalone annotator review page from the blind
// holdout package. Only blind fields are embedded: the labelled
// holdout, engineering pre-labels and prototype outputs are never
// read here. Run offline: node prototype/ai-seo/annotation/build-review-page.mjs
import {readFile, writeFile} from 'node:fs/promises';

const blind = JSON.parse(await readFile(new URL('../fixtures/claim-holdout-blind-v1.json', import.meta.url)));
const data = blind.entries.map(e => ({id: e.id, language: e.language, text: e.text,
  evidence: e.evidence.map(ev => ({excerpt: ev.quote_excerpt}))}));

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Growth-OS 文案證據審閱</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "PingFang TC", "Microsoft JhengHei", sans-serif; margin: 0; background: #f4f6f8; color: #1c2733; }
  header { background: #17324f; color: #fff; padding: 20px 24px; }
  header h1 { margin: 0 0 6px; font-size: 22px; }
  header p { margin: 0; opacity: .85; }
  main { max-width: 860px; margin: 0 auto; padding: 20px 16px 64px; }
  .bar { background: #fff; border: 1px solid #d8e0e8; padding: 14px 16px; margin-bottom: 16px; }
  .bar input { font-size: 16px; padding: 6px 8px; }
  .card { background: #fff; border: 1px solid #d8e0e8; padding: 18px; margin-bottom: 16px; }
  .card h2 { font-size: 15px; margin: 0 0 10px; color: #52616e; }
  .evidence { background: #eef4ea; border: 1px solid #cfdec6; padding: 10px 12px; white-space: pre-wrap; }
  .claim { font-size: 18px; line-height: 1.6; margin: 14px 0; }
  .choices label { display: inline-block; margin: 4px 10px 4px 0; font-size: 16px; }
  textarea { width: 100%; min-height: 52px; font-size: 15px; }
  button { font-size: 16px; padding: 10px 16px; margin: 6px 8px 6px 0; cursor: pointer; }
  .primary { background: #17324f; color: #fff; border: 0; }
  #progress { font-weight: 600; }
  details { background: #fff; border: 1px solid #d8e0e8; padding: 14px 16px; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #d8e0e8; padding: 6px; text-align: left; }
</style>
</head>
<body>
<header>
  <h1>文案證據審閱</h1>
  <p>請逐題閱讀「來源證據」與「待判斷文案」，判斷文案是否符合證據。不需要任何技術背景。</p>
</header>
<main>
  <div class="bar">
    <label>審閱者代號：<input id="annotator" placeholder="例如 A 或 B"></label>
    <div>
      <button id="exportBackup">備份進度檔</button>
      <label>還原進度檔：<input type="file" id="importBackup" accept=".json"></label>
    </div>
    <p>若瀏覽器或開啟方式不保存進度，請用「備份進度檔」把進度存成檔案，下次用「還原進度檔」載入即可繼續，內容與代號都會一起還原。</p>
    <span id="progress"></span>
    <div>
      <button class="primary" id="exportCsv">下載我的審閱結果 (CSV)</button>
      <button id="exportJson">下載 JSON</button>
    </div>
    <p>每位審閱者請各自填寫並下載自己的檔案，不要互相討論答案。進度會自動保存在這台裝置的瀏覽器中。</p>
  </div>
  <div id="cases"></div>
  <details>
    <summary>裁決者專用：比對兩位審閱者</summary>
    <p>依序選取兩位審閱者的 CSV 檔案，系統只列出判定不同的題目。裁決者選定最終判定後，可下載裁決紀錄。</p>
    <input type="file" id="fileA" accept=".csv">
    <input type="file" id="fileB" accept=".csv">
    <div id="disputes"></div>
    <button class="primary" id="exportAdj" disabled>下載裁決紀錄 (CSV)</button>
  </details>
</main>
<script>
const CASES = ${JSON.stringify(data)};
const root = document.getElementById('cases');
const annotatorInput = document.getElementById('annotator');
// The annotator code itself is persisted first: without it, a
// reload would look up the anonymous bucket and the saved answers
// would appear lost even though they are still stored.
const CODE_KEY = 'growthos-review-annotator-code';
try { annotatorInput.value = localStorage.getItem(CODE_KEY) || ''; } catch {}
const storeKey = () => 'growthos-review-' + (annotatorInput.value.trim() || 'anon');
const load = () => { try { return JSON.parse(localStorage.getItem(storeKey()) || '{}'); } catch { return {}; } };
const save = (state) => {
  try {
    localStorage.setItem(CODE_KEY, annotatorInput.value.trim());
    localStorage.setItem(storeKey(), JSON.stringify(state));
  } catch {}
};
function render() {
  const state = load();
  root.innerHTML = '';
  CASES.forEach((c, i) => {
    const card = document.createElement('section'); card.className = 'card';
    const saved = state[c.id] || {};
    card.innerHTML = '<h2>第 ' + (i + 1) + ' 題（共 ' + CASES.length + ' 題）</h2>'
      + '<div>來源證據：</div><div class="evidence"></div>'
      + '<div class="claim"></div>'
      + '<div class="choices">'
      + ['正確', '錯誤', '無法判定'].map(v =>
          '<label><input type="radio" name="' + c.id + '" value="' + v + '"'
          + (saved.decision === v ? ' checked' : '') + '> ' + v + '</label>').join('')
      + '</div>'
      + '<label>理由（必填，一句話即可）<textarea data-reason="' + c.id + '"></textarea></label>';
    card.querySelector('.evidence').textContent = c.evidence.map(e => e.excerpt).join('\\n---\\n');
    card.querySelector('.claim').textContent = '待判斷文案：' + c.text;
    const area = card.querySelector('textarea'); area.value = saved.reason || '';
    card.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => {
      const s = load(); s[c.id] = {decision: r.value, reason: area.value}; save(s); progress();
    }));
    area.addEventListener('input', () => {
      const s = load(); s[c.id] = {decision: (s[c.id] || {}).decision || '', reason: area.value}; save(s); progress();
    });
    root.appendChild(card);
  });
  progress();
}
function rows() {
  const state = load();
  return CASES.map(c => ({case_id: c.id, annotator_code: annotatorInput.value.trim(),
    decision: (state[c.id] || {}).decision || '', reason: (state[c.id] || {}).reason || ''}));
}
function progress() {
  const done = rows().filter(r => r.decision && r.reason.trim()).length;
  document.getElementById('progress').textContent = ' 已完成 ' + done + ' / ' + CASES.length + ' 題';
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
document.getElementById('exportCsv').addEventListener('click', () => {
  const lines = ['case_id,annotator_code,decision,reason'];
  rows().forEach(r => lines.push([r.case_id, r.annotator_code, r.decision, r.reason].map(csvCell).join(',')));
  download('review-' + (annotatorInput.value.trim() || 'anon') + '.csv', lines.join('\\n'), 'text/csv');
});
document.getElementById('exportJson').addEventListener('click', () => {
  download('review-' + (annotatorInput.value.trim() || 'anon') + '.json',
    JSON.stringify(rows(), null, 2), 'application/json');
});
annotatorInput.addEventListener('input', () => {
  try { localStorage.setItem(CODE_KEY, annotatorInput.value.trim()); } catch {}
});
annotatorInput.addEventListener('change', render);
document.getElementById('exportBackup').addEventListener('click', () => {
  download('review-progress-' + (annotatorInput.value.trim() || 'anon') + '.json',
    JSON.stringify({annotator_code: annotatorInput.value.trim(), answers: load()}, null, 2),
    'application/json');
});
document.getElementById('importBackup').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.answers !== 'object') throw new Error('bad backup');
    annotatorInput.value = data.annotator_code || '';
    save(data.answers);
    render();
  } catch { alert('進度檔無法讀取，請確認檔案是否正確。'); }
});
let adjRows = [];
function parseCsv(text) {
  const lines = text.trim().split(/\\r?\\n/).slice(1);
  return Object.fromEntries(lines.map(line => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((v, i) => i % 2 === 0 || v !== '');
    const clean = (v) => (v || '').replace(/^"|"$/g, '').replace(/""/g, '"');
    return [clean(cells[0]), {decision: clean(cells[2]), reason: clean(cells[3])}];
  }));
}
async function compare() {
  const fa = document.getElementById('fileA').files[0];
  const fb = document.getElementById('fileB').files[0];
  if (!fa || !fb) return;
  const a = parseCsv(await fa.text()); const b = parseCsv(await fb.text());
  adjRows = [];
  const box = document.getElementById('disputes'); box.innerHTML = '';
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>題號</th><th>審閱者一</th><th>審閱者二</th><th>裁決</th></tr>';
  CASES.forEach(c => {
    if ((a[c.id] || {}).decision === (b[c.id] || {}).decision) return;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + c.id + '</td><td></td><td></td><td>'
      + ['正確', '錯誤', '無法判定'].map(v => '<label><input type="radio" name="adj-' + c.id + '" value="' + v + '"> ' + v + '</label>').join(' ')
      + '</td>';
    tr.children[1].textContent = ((a[c.id] || {}).decision || '') + '：' + ((a[c.id] || {}).reason || '');
    tr.children[2].textContent = ((b[c.id] || {}).decision || '') + '：' + ((b[c.id] || {}).reason || '');
    tr.querySelectorAll('input').forEach(r => r.addEventListener('change', () => {
      adjRows = adjRows.filter(x => x.case_id !== c.id);
      adjRows.push({case_id: c.id, annotator_a: (a[c.id] || {}).decision || '',
        annotator_b: (b[c.id] || {}).decision || '', adjudicated: r.value});
      document.getElementById('exportAdj').disabled = false;
    }));
    table.appendChild(tr);
  });
  if (!table.querySelectorAll('tr').length || table.rows.length === 1) {
    box.textContent = '兩位審閱者沒有分歧。';
  } else box.appendChild(table);
}
document.getElementById('fileA').addEventListener('change', compare);
document.getElementById('fileB').addEventListener('change', compare);
document.getElementById('exportAdj').addEventListener('click', () => {
  const lines = ['case_id,annotator_a,annotator_b,adjudicated'];
  adjRows.forEach(r => lines.push([r.case_id, r.annotator_a, r.annotator_b, r.adjudicated].map(csvCell).join(',')));
  download('adjudication.csv', lines.join('\\n'), 'text/csv');
});
render();
</script>
</body>
</html>
`;
await writeFile(new URL('./review.html', import.meta.url), html);
console.log('wrote review.html with', data.length, 'cases');
