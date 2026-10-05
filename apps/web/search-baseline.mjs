const DAY = 86400000;
export class BaselineError extends Error {}
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BaselineError('日期請使用 YYYY-MM-DD。');
  const stamp = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) throw new BaselineError('日期不存在。');
  return stamp;
}
export function preview(text, meta, {allowEmpty=false}={}) {
  let url;
  try { url = new URL(meta.origin); } catch { throw new BaselineError('請填入完整 HTTPS 網站來源，例如 https://shop.example。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) throw new BaselineError('網站來源只能包含 HTTPS 與主機名稱，不可附帶路徑、帳密或參數。');
  if (!['web', 'image', 'video', 'news'].includes(meta.type)) throw new BaselineError('請選擇單一搜尋類型。');
  const start = day(meta.start), end = day(meta.end);
  if (end < start || (end - start) / DAY >= 366) throw new BaselineError('期間須為 1 至 366 天，結束日不能早於開始日。');
  const exported = Date.parse(meta.exported);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(meta.exported) || !Number.isFinite(exported)) throw new BaselineError('匯出時間須含時區，例如 2026-09-05T09:00:00+08:00。');
  if (new TextEncoder().encode(text).length > 1000000) throw new BaselineError('檔案超過 1 MB。');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines.shift() !== 'date,clicks,impressions') throw new BaselineError('第一列必須是 date,clicks,impressions；請使用標準化範本。');
  const rows = [], seen = new Set();
  let clicks = 0, impressions = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const fail = message => { throw new BaselineError(`第 ${i + 2} 行：${message}`); };
    const fields = line.split(',').map(x => x.trim());
    if (fields.length !== 3 || fields.some(x => x.includes('"'))) fail('請填三個未加引號的欄位，避免混入查詢或網頁資料。');
    let stamp;
    try { stamp = day(fields[0]); } catch (error) { fail(error.message); }
    if (stamp < start || stamp > end) fail('日期不在選定期間內。');
    if (seen.has(fields[0])) fail('日期重複。');
    if (fields.slice(1).some(x => !/^\d+$/.test(x) || !Number.isSafeInteger(Number(x)))) fail('點擊與曝光須為明確的非負整數，空白不可當成零。');
    const c = Number(fields[1]), m = Number(fields[2]);
    if (!m && c) fail('有點擊時，曝光不能為零。');
    clicks += c; impressions += m;
    if (!Number.isSafeInteger(clicks) || !Number.isSafeInteger(impressions)) fail('數值加總超過瀏覽器可精確處理的範圍。');
    seen.add(fields[0]); rows.push({date: fields[0], clicks: c, impressions: m});
  });
  if (!rows.length && !allowEmpty) throw new BaselineError('沒有每日資料，請貼上範本或選取檔案。');
  const missing = [];
  for (let d = start; d <= end; d += DAY) { const label = new Date(d).toISOString().slice(0, 10); if (!seen.has(label)) missing.push(label); }
  return {origin: url.origin, type: meta.type, aggregation: 'property_daily', start: meta.start, end: meta.end, exported: new Date(exported).toISOString(), days: (end - start) / DAY + 1, rows: rows.sort((a,b)=>a.date.localeCompare(b.date)), missing, complete: !missing.length, clicks, impressions, ctr: impressions ? clicks / impressions : null, provenance: 'caller_supplied_unverified'};
}
export function compare(before, after) {
  if (!before.complete || !after.complete) throw new BaselineError('兩段期間都須沒有缺少日期，才能比較。');
  if (before.origin !== after.origin || before.type !== after.type || before.aggregation !== after.aggregation) throw new BaselineError('兩段期間須使用相同網站來源與搜尋類型。');
  if (before.end >= after.start) throw new BaselineError('比較期間須在基線結束後開始，不能重疊。');
  if (before.days !== after.days) throw new BaselineError('兩段期間須有相同日數。');
  return {clickDifference: after.clicks - before.clicks, impressionDifference: after.impressions - before.impressions, interpretation: 'observed_difference_not_causal_lift'};
}
