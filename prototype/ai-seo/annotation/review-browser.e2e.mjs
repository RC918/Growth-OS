// Real-browser end-to-end check for the annotator review page.
// Uses Playwright with a real Chromium/Chrome (CI installs Chromium;
// locally set REVIEW_CHROME_PATH to a Chrome/Chromium executable if
// Playwright's browser is not downloaded). It drives the page like a
// human: click label text, navigate, reload, close and reopen, then
// export CSV and JSON and require screen, storage and files to agree.
// Run: node prototype/ai-seo/annotation/review-browser.e2e.mjs
import {chromium} from 'playwright';
import {readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const blind = JSON.parse(await readFile(new URL('../fixtures/claim-holdout-blind-v2.json', import.meta.url), 'utf8'));
const order = blind.entries.map(e => e.id);
const finals = {h16: '正確', h18: '無法判定', h21: '無法判定', h25: '正確', h29: '錯誤'};
const firsts = {h16: '錯誤', h18: '錯誤', h21: '正確', h25: '無法判定', h29: '正確'};

const launchOptions = {headless: true, args: ['--no-sandbox', '--disable-gpu']};
if (process.env.REVIEW_CHROME_PATH) launchOptions.executablePath = process.env.REVIEW_CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({acceptDownloads: true});
let page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const pageUrl = new URL('./review.html', import.meta.url).href;
async function currentPos() {
  return Number(await page.evaluate(() => localStorage.getItem('growthos-review-position') || 0));
}
async function goto(id) {
  const target = order.indexOf(id);
  for (let guard = 0; guard < 60; guard++) {
    const pos = await currentPos();
    if (pos === target) return;
    await page.click(pos < target ? '#nextBtn' : '#prevBtn');
  }
  throw new Error('goto failed: ' + id);
}
async function answer(decision, reason) {
  await page.locator('.choices label', {hasText: decision}).first().click();
  await page.fill('textarea', reason);
}
async function displayed() {
  return page.evaluate(() => ({
    decision: document.querySelector('input[type=radio]:checked')?.value || '',
    reason: document.querySelector('textarea').value,
  }));
}

await page.goto(pageUrl);
await page.fill('#annotator', 'E2E');
await page.locator('h1').click();
for (const id of Object.keys(finals)) {
  await goto(id);
  await answer(firsts[id], '先選 ' + id);
  await goto('h01');
  await goto(id);
  await answer(finals[id], '最後選擇 ' + id);
}
await page.close();
page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.goto(pageUrl);
await page.reload();

const report = {displayed: {}, csv: {}, json: {}};
for (const id of Object.keys(finals)) {
  await goto(id);
  report.displayed[id] = await displayed();
}
const storage = await page.evaluate(() => {
  const code = localStorage.getItem('growthos-review-annotator-code');
  return {code, answers: JSON.parse(localStorage.getItem('growthos-review-' + code) || '{}')};
});
async function exportVia(kind, buttonId, filename) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => { await page.click(buttonId); await page.click('#exportConfirm'); })(),
  ]);
  const path = join(tmpdir(), filename);
  await dl.saveAs(path);
  return readFile(path, 'utf8');
}
const csvText = await exportVia('CSV', '#exportCsv', 'review-e2e.csv');
for (const line of csvText.trim().split('\n').slice(1)) {
  const m = line.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
  if (m && finals[m[1]]) report.csv[m[1]] = {decision: m[3], reason: m[4]};
}
const jsonText = await exportVia('JSON', '#exportJson', 'review-e2e.json');
for (const r of JSON.parse(jsonText).rows) {
  if (finals[r.case_id]) report.json[r.case_id] = {decision: r.decision, reason: r.reason};
}

let ok = errors.length === 0;
for (const id of Object.keys(finals)) {
  const agree = report.displayed[id].decision === finals[id]
    && storage.answers[id]?.decision === finals[id]
    && report.csv[id]?.decision === finals[id]
    && report.json[id]?.decision === finals[id]
    && report.csv[id]?.reason === '最後選擇 ' + id;
  console.log(id, agree ? 'AGREE' : 'MISMATCH', JSON.stringify({
    screen: report.displayed[id].decision, storage: storage.answers[id]?.decision,
    csv: report.csv[id]?.decision, json: report.json[id]?.decision}));
  if (!agree) ok = false;
}
await writeFile(join(tmpdir(), 'review-e2e-report.json'), JSON.stringify(report, null, 2));
console.log(ok ? 'REAL_BROWSER_E2E_PASS' : 'REAL_BROWSER_E2E_FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
