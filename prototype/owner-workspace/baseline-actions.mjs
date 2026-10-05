import {BaselineError} from './search-baseline.mjs';
export function validateActions(actions) {
  if(!Array.isArray(actions)||actions.length>20) throw new BaselineError('發布紀錄最多 20 筆。');
  const seen=new Set();
  return actions.map(action=>{
    if(!action||typeof action!=='object'||Array.isArray(action)||Object.keys(action).sort().join(',')!=='date,note,path') throw new BaselineError('發布紀錄欄位不符。');
    const {date,path,note}=action;
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new BaselineError('發布日期不存在，請使用 YYYY-MM-DD。');
    let decoded;
    try{decoded=decodeURIComponent(path);}catch{throw new BaselineError('頁面路徑的編碼不正確。');}
    if(typeof path!=='string'||path.length>300||!path.startsWith('/')||path.startsWith('//')||/[\s\\?#]/.test(path)||/[\s\\?#\u0000-\u001f\u007f]/.test(decoded)||decoded.startsWith('//')||decoded.split('/').some(x=>x==='.'||x==='..')) throw new BaselineError('請填網站內的頁面路徑，例如 /product-comparison，不含網域、參數或相對跳轉。');
    if(typeof note!=='string'||!note.trim()||note.length>240||/[\r\n\u0000-\u001f\u007f]/.test(note)) throw new BaselineError('措施說明須為 1 至 240 字的單行文字。');
    const result={date,path,note:note.trim()},key=JSON.stringify(result);
    if(seen.has(key)) throw new BaselineError('相同的發布紀錄已存在。'); seen.add(key); return result;
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.path.localeCompare(b.path));
}
