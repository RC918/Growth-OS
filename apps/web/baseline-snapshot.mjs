import {preview, BaselineError} from './search-baseline.mjs';
const MAX_BYTES=1000000;
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== expected.slice().sort().join(',')) throw new BaselineError('保存檔的欄位或格式不符，請使用本工具匯出的版本。');
}
function dataset(value) {
  keys(value,['meta','rows','sample']);
  keys(value.meta,['origin','type','start','end','exported']);
  if (Object.values(value.meta).some(x=>typeof x!=='string') || typeof value.sample !== 'boolean' || !Array.isArray(value.rows) || value.rows.length>366) throw new BaselineError('保存檔的資料型別或每日列數不符。');
  const lines=value.rows.map(row=>{
    keys(row,['date','clicks','impressions']);
    if (typeof row.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isSafeInteger(row.clicks) || !Number.isSafeInteger(row.impressions) || row.clicks<0 || row.impressions<0) throw new BaselineError('保存檔包含無效日期或數值。');
    return `${row.date},${row.clicks},${row.impressions}`;
  });
  const csv='date,clicks,impressions\n'+lines.join('\n');
  return {meta:value.meta,csv,sample:value.sample,result:preview(csv,value.meta)};
}
export function loadSnapshot(text) {
  if (typeof text!=='string' || new TextEncoder().encode(text).length>MAX_BYTES) throw new BaselineError('保存檔須小於 1 MB。');
  let parsed;
  try {parsed=JSON.parse(text);} catch {throw new BaselineError('無法讀取 JSON 保存檔。');}
  keys(parsed,['format','version','a','b']);
  if(parsed.format!=='growth-os-search-baseline' || parsed.version!==1) throw new BaselineError('不支援此保存檔版本。');
  return {a:dataset(parsed.a),b:parsed.b===null?null:dataset(parsed.b)};
}
export function saveSnapshot(a,b,samples) {
  const pack=(result,sample)=>result?{meta:{origin:result.origin,type:result.type,start:result.start,end:result.end,exported:result.exported},rows:result.rows,sample:Boolean(sample)}:null;
  const text=JSON.stringify({format:'growth-os-search-baseline',version:1,a:pack(a,samples.a),b:pack(b,samples.b)},null,2);
  loadSnapshot(text); // Save only data that can pass the same reload validation.
  return text;
}
