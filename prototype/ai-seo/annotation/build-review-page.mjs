// Builds the standalone annotator review page from the blind
// holdout package (v2: evidence completed to full verbatim source
// sentences). Only blind fields are embedded: the labelled holdout,
// engineering pre-labels and prototype outputs are never read here.
// Run offline: node prototype/ai-seo/annotation/build-review-page.mjs
import {readFile, writeFile} from 'node:fs/promises';

const blind = JSON.parse(await readFile(new URL('../fixtures/claim-holdout-blind-v2.json', import.meta.url)));
// Translation aid only: Traditional Chinese is the primary reading
// text; the English original stays available as a collapsed reference.
// Translations are never an annotation or a hint.
const translations = JSON.parse(await readFile(new URL('../fixtures/claim-holdout-translations-v2.json', import.meta.url)));
const data = blind.entries.map(e => {
  const tr = translations.translations[e.id] ?? {};
  return {id: e.id, language: e.language, text: e.text,
    text_zh: tr.text_zh ?? '',
    evidence: e.evidence.map((ev, i) => ({excerpt: ev.quote_excerpt,
      excerpt_zh: (tr.evidence_zh ?? [])[i] ?? ''}))};
});

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
  .bar, .guide { background: #fff; border: 1px solid #d8e0e8; padding: 14px 16px; margin-bottom: 16px; }
  .guide { border-left: 6px solid #17324f; line-height: 1.7; }
  .bar input { font-size: 16px; padding: 6px 8px; }
  .card { background: #fff; border: 1px solid #d8e0e8; padding: 18px; margin-bottom: 16px; }
  .card h2 { font-size: 15px; margin: 0 0 10px; color: #52616e; }
  .evidence { background: #eef4ea; border: 1px solid #cfdec6; padding: 10px 12px; white-space: pre-wrap; line-height: 1.7; }
  .claim { font-size: 19px; line-height: 1.7; margin: 14px 0; }
  .choices label { display: inline-block; margin: 4px 10px 4px 0; font-size: 16px; }
  textarea { width: 100%; min-height: 52px; font-size: 15px; }
  button { font-size: 16px; padding: 10px 16px; margin: 6px 8px 6px 0; cursor: pointer; }
  .primary { background: #17324f; color: #fff; border: 0; }
  #progress { font-weight: 600; }
  .nav { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .nav .pos { font-weight: 600; }
  details.ref { background: #fafbfc; border: 1px dashed #b9c6d2; padding: 10px 12px; margin-top: 10px; }
  details.ref .evidence { background: #f2f4f6; border-color: #d8e0e8; }
  details.adj { background: #fff; border: 1px solid #d8e0e8; padding: 14px 16px; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #d8e0e8; padding: 6px; text-align: left; }
</style>
</head>
<body>
<header>
  <h1>文案證據審閱</h1>
  <p>請逐題閱讀「來源證據」與「待判斷文案」，判斷文案是否符合證據。不需要任何技術背景。畫面以繁體中文為主，英文原文收在每題下方的「英文原文（參考）」中，需要時再展開核對。</p>
  <p>頁面版本：${blind.version}</p>
</header>
<main>
  <div class="guide">
    <strong>判斷準則（請先讀完再開始）：</strong>
    <ol>
      <li>比較的是<strong>語意</strong>，不是字串是否一模一樣：換句話說但意思相同，仍可判為正確。</li>
      <li>來源證據<strong>沒有支持</strong>的商品主張（例如規格、材質、保固、價格、性能），不得視為正確。</li>
      <li>文案與證據<strong>互相矛盾</strong>時，判為錯誤；證據不足以判斷時，請選「無法判定」，不要猜測。</li>
      <li>文案的每一個主張都要有證據支持，只要有一部分不符合，整題就不能判為正確。</li>
    </ol>
  </div>
  <div class="bar">
    <label>審閱者代號：<input id="annotator" placeholder="例如 A 或 B"></label>
    <div>
      <button id="exportBackup">備份進度檔</button>
      <label>還原進度檔：<input type="file" id="importBackup" accept=".json"></label>
    </div>
    <p>若瀏覽器或開啟方式不保存進度，請用「備份進度檔」把進度存成檔案，下次用「還原進度檔」載入即可繼續，內容與代號都會一起還原。</p>
    <div>
      <button id="exportDiag">下載診斷對照報告（只讀）</button>
    </div>
    <p>若畫面上的判定與匯出結果不同，請按此鈕下載診斷報告交回，不需重新填寫；報告只含版本、代號與各題判定對照，不含任何帳號或金鑰。</p>
    <span id="progress"></span>
    <div>
      <button class="primary" id="exportCsv">匯出前確認並下載 CSV</button>
      <button id="exportJson">下載 JSON</button>
    </div>
    <div id="exportPreview"></div>
    <p>每位審閱者請各自填寫並下載自己的檔案，不要互相討論答案。進度會自動保存在這台裝置的瀏覽器中。新版頁面會自動接續你在舊版已填寫的答案，不會遺失。</p>
  </div>
  <div class="nav">
    <button id="prevBtn">← 上一題</button>
    <span class="pos" id="posLabel"></span>
    <button id="nextBtn">下一題 →</button>
  </div>
  <div id="cases"></div>
  <details class="adj">
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
const PACKAGE_VERSION = 'phase3b2-claim-holdout-blind-v2';
const root = document.getElementById('cases');
const annotatorInput = document.getElementById('annotator');
// The annotator code itself is persisted first: without it, a
// reload would look up the anonymous bucket and the saved answers
// would appear lost even though they are still stored.
const CODE_KEY = 'growthos-review-annotator-code';
const POS_KEY = 'growthos-review-position';
try { annotatorInput.value = localStorage.getItem(CODE_KEY) || ''; } catch {}
// Single source of truth: the in-memory state object below is what
// the screen renders and what exports serialize. It is bound to
// the active annotator code; typing in the code field does not switch buckets
// until the field is committed (change), so the displayed answers
// can never be silently re-read from a different bucket at export.
let activeCode = annotatorInput.value.trim();
const storeKeyFor = (code) => 'growthos-review-' + (code || 'anon');
const loadFor = (code) => { try { return JSON.parse(localStorage.getItem(storeKeyFor(code)) || '{}'); } catch { return {}; } };
let state = loadFor(activeCode);
const save = () => {
  try {
    localStorage.setItem(CODE_KEY, activeCode);
    localStorage.setItem(storeKeyFor(activeCode), JSON.stringify(state));
  } catch {}
};
let pos = 0;
try { pos = Math.min(Math.max(parseInt(localStorage.getItem(POS_KEY) || '0', 10) || 0, 0), CASES.length - 1); } catch {}
function render() {
  root.innerHTML = '';
  const c = CASES[pos];
  const saved = state[c.id] || {};
  const card = document.createElement('section'); card.className = 'card';
  card.innerHTML = '<h2>第 ' + (pos + 1) + ' 題（共 ' + CASES.length + ' 題）</h2>'
    + '<div>來源證據：</div><div class="evidence zh"></div>'
    + '<div class="claim zh"></div>'
    + '<div class="choices">'
    + ['正確', '錯誤', '無法判定'].map(v =>
        '<label><input type="radio" name="' + c.id + '" value="' + v + '"'
        + (saved.decision === v ? ' checked' : '') + '> ' + v + '</label>').join('')
    + '</div>'
    + '<label>理由（必填，一句話即可）<textarea data-reason="' + c.id + '"></textarea></label>'
    + '<details class="ref"><summary>英文原文（參考）</summary>'
    + '<div>來源證據（英文原文）：</div><div class="evidence en"></div>'
    + '<div class="claim en"></div></details>';
  card.querySelector('.evidence.zh').textContent = c.evidence.map(e => e.excerpt_zh).join('\\n---\\n');
  card.querySelector('.claim.zh').textContent = '待判斷文案：' + c.text_zh;
  card.querySelector('.evidence.en').textContent = c.evidence.map(e => e.excerpt).join('\\n---\\n');
  card.querySelector('.claim.en').textContent = '待判斷文案（英文原文）：' + c.text;
  const area = card.querySelector('textarea'); area.value = saved.reason || '';
  card.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => {
    state[c.id] = {decision: r.value, reason: area.value}; save(); invalidatePreview(); progress();
  }));
  area.addEventListener('input', () => {
    state[c.id] = {decision: (state[c.id] || {}).decision || '', reason: area.value}; save(); invalidatePreview(); progress();
  });
  root.appendChild(card);
  document.getElementById('posLabel').textContent = '第 ' + (pos + 1) + ' / ' + CASES.length + ' 題';
  document.getElementById('prevBtn').disabled = pos === 0;
  document.getElementById('nextBtn').disabled = pos === CASES.length - 1;
  progress();
}
function go(delta) {
  pos = Math.min(Math.max(pos + delta, 0), CASES.length - 1);
  try { localStorage.setItem(POS_KEY, String(pos)); } catch {}
  render();
}
document.getElementById('prevBtn').addEventListener('click', () => go(-1));
document.getElementById('nextBtn').addEventListener('click', () => go(1));
function rows() {
  return CASES.map(c => ({case_id: c.id, annotator_code: activeCode,
    decision: (state[c.id] || {}).decision || '', reason: (state[c.id] || {}).reason || ''}));
}
function progress() {
  const done = rows().filter(r => r.decision && r.reason.trim()).length;
  document.getElementById('progress').textContent = ' 已完成 ' + done + ' / ' + CASES.length + ' 題（代號：' + (activeCode || '未填') + '）';
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The preview freezes a snapshot; the confirm button downloads exactly
// that snapshot, and any later edit invalidates the preview instead of
// silently downloading something different from what was shown.
let previewSnapshot = null;
function invalidatePreview() {
  previewSnapshot = null;
  document.getElementById('exportPreview').innerHTML = '';
}
function downloadCsv(snapshotRows) {
  const lines = ['case_id,annotator_code,decision,reason'];
  snapshotRows.forEach(r => lines.push([r.case_id, r.annotator_code, r.decision, r.reason].map(csvCell).join(',')));
  download('review-' + (activeCode || 'anon') + '.csv', lines.join('\\n'), 'text/csv');
}
function downloadJson(snapshotRows) {
  download('review-' + (activeCode || 'anon') + '.json',
    JSON.stringify({package_version: PACKAGE_VERSION, annotator_code: activeCode,
      exported_from: 'ui-state', rows: snapshotRows}, null, 2), 'application/json');
}
function showPreview(kind) {
  previewSnapshot = {kind, rows: JSON.parse(JSON.stringify(rows()))};
  const box = document.getElementById('exportPreview');
  const list = previewSnapshot.rows.map(r => '<tr><td>' + escapeHtml(r.case_id) + '</td><td>'
    + escapeHtml(r.decision || '（未填）') + '</td><td>' + escapeHtml(r.reason || '') + '</td></tr>').join('');
  box.innerHTML = '<div class="guide"><strong>匯出前確認</strong>：以下就是即將匯出的內容'
    + '（代號：' + escapeHtml(activeCode || '未填') + '，題目版本：' + PACKAGE_VERSION + '）。'
    + '若與畫面上的選擇不同，請先回到該題修正，不要下載。'
    + '<table><tr><th>題號</th><th>判定</th><th>理由</th></tr>' + list + '</table>'
    + '<button class="primary" id="exportConfirm">確認無誤，下載 ' + kind + '</button></div>';
  document.getElementById('exportConfirm').addEventListener('click', () => {
    if (!previewSnapshot) return;
    if (previewSnapshot.kind === 'CSV') downloadCsv(previewSnapshot.rows);
    else downloadJson(previewSnapshot.rows);
  });
}
document.getElementById('exportDiag').addEventListener('click', () => {
  const bucketCodes = new Set([activeCode]);
  try {
    const storedCode = localStorage.getItem(CODE_KEY);
    if (storedCode) bucketCodes.add(storedCode);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('growthos-review-') && k !== CODE_KEY && k !== POS_KEY) {
        bucketCodes.add(k.slice('growthos-review-'.length));
      }
    }
  } catch {}
  const buckets = {};
  for (const code of bucketCodes) {
    const answers = loadFor(code);
    buckets[code || 'anon'] = Object.fromEntries(Object.entries(answers)
      .map(([id, a]) => [id, {decision: a.decision || '', reason: a.reason || ''}]));
  }
  const report = {
    page_version: PACKAGE_VERSION,
    page_path: location.pathname || '',
    active_code: activeCode,
    displayed_and_exported_rows: rows(),
    stored_buckets: buckets,
  };
  download('review-diagnostic-' + (activeCode || 'anon') + '.json',
    JSON.stringify(report, null, 2), 'application/json');
});
document.getElementById('exportCsv').addEventListener('click', () => showPreview('CSV'));
document.getElementById('exportJson').addEventListener('click', () => showPreview('JSON'));
annotatorInput.addEventListener('change', () => {
  activeCode = annotatorInput.value.trim();
  state = loadFor(activeCode);
  invalidatePreview();
  render();
});
document.getElementById('exportBackup').addEventListener('click', () => {
  download('review-progress-' + (activeCode || 'anon') + '.json',
    JSON.stringify({annotator_code: activeCode, package_version: PACKAGE_VERSION, answers: state}, null, 2),
    'application/json');
});
document.getElementById('importBackup').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.answers !== 'object') throw new Error('bad backup');
    annotatorInput.value = data.annotator_code || '';
    activeCode = annotatorInput.value.trim();
    state = data.answers;
    save();
    invalidatePreview();
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
