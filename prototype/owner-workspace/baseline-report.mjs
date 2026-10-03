import {compare} from './search-baseline.mjs';
import {saveSnapshot,loadSnapshot} from './baseline-snapshot.mjs';
const types={web:'網頁搜尋',image:'圖片搜尋',video:'影片搜尋',news:'新聞搜尋'};
const count=value=>value.toLocaleString('zh-TW');
const percent=value=>value===null?'無法計算（曝光為零）':(value*100).toFixed(2)+'%';
const signed=value=>(value>0?'+':'')+count(value);
const escapeMarkdown=text=>text.replace(/[\\`*_{}\[\]()<>#!|]/g,'\\$&');
function assessment(before,after) {
  if(!before.complete) return {label:'先補齊基線資料',detail:`基線期間缺少 ${before.missing.length} 天，不能代表完整期間。`,nextStep:'先補齊基線每日資料；只有確定沒有點擊與曝光的日期才填零。'};
  if(!after) return {label:'已有基線，尚不能比較',detail:'只有一段完整資料，還沒有後續期間可判讀變化。',nextStep:'加入同網站、同搜尋類型、同日數且不重疊的後續期間。'};
  if(!after.complete) return {label:'先補齊後續資料',detail:`後續期間缺少 ${after.missing.length} 天，目前不能比較差額。`,nextStep:'先補齊後續每日資料；不要將缺少的日期直接當成零。'};
  try {compare(before,after);} catch(error) {return {label:'先修正比較條件',detail:error.message,nextStep:'依上方原因修正期間或來源，再重新產生報告。'};}
  return {label:'可比較觀察值，不能歸因',detail:'兩段資料完整且比較條件一致，可描述點擊與曝光差異；不能據此判定措施有效。',nextStep:'核對資料來源與發布紀錄，持續記錄同口徑資料；目前仍未驗證成長原因。'};
}
export function growthReport(a,b,samples,actions=[]) {
  // Reconstruct from daily inputs; never trust caller-supplied aggregates.
  const checked=loadSnapshot(saveSnapshot(a,b,samples,actions));
  const before=checked.a.result,after=checked.b?.result;
  const observations=[],inference=[],unknowns=[
    '網站來源、搜尋類型與匯出時間由提供者聲明，尚未向 Google 核實。',
    '未提供到站訪問、商業轉換或 AI 能見度資料，因此這些成果仍未知。',
    '未驗證發布紀錄、對照組或其他影響因素，無法將差異歸因於內容或行銷措施。'
  ],nextSteps=[];
  const describe=(label,result)=>{
    observations.push(`${label}：${result.origin}；${types[result.type]}；${result.start} 至 ${result.end}（${result.days} 天）；匯出時間 ${result.exported}。`);
    observations.push(`${label}已提供 ${result.rows.length}/${result.days} 天：觀察到點擊 ${count(result.clicks)}、曝光 ${count(result.impressions)}、點擊率 ${percent(result.ctr)}。`);
    if(!result.complete) {
      unknowns.push(`${label}缺少日期：${result.missing.join('、')}。缺日為未知，以上加總不能代表完整期間。`);
      nextSteps.push(`補齊${label}缺少的每日資料，保留明確的零值，再重新檢查。`);
    }
  };
  describe('基線期間',before); if(after) describe('後續期間',after);
  if(checked.actions.length) {
    observations.push(`提供者聲明的發布紀錄 ${checked.actions.length} 筆，以基線網站 ${before.origin} 為記錄對象。`);
    for(const action of checked.actions) {
      const interval=action.date>=before.start&&action.date<=before.end?'基線期間':after&&action.date>=after.start&&action.date<=after.end?'後續期間':'觀察期間之外';
      observations.push(`聲明發布：${action.date}；${action.path}；${action.note}（${interval}）。`);
    }
    unknowns.push('發布日期與措施由提供者自行記錄；尚未核對頁面、審核版本或實際發布狀態，日期須與每日 CSV 使用相同口徑。');
  } else {
    unknowns.push('尚未提供發布紀錄。');
    nextSteps.push('記錄實際措施的頁面路徑、發布日期與說明，供後續核對；紀錄本身不是施策效果證據。');
  }

  if(after) {
    try {
      const result=compare(before,after);
      observations.push(`兩段期間條件一致且完整：點擊差額 ${signed(result.clickDifference)}，曝光差額 ${signed(result.impressionDifference)}。`);
      inference.push('可以描述兩段期間的搜尋點擊與曝光差異；差額本身不足以判定施策效果。');
      nextSteps.push('持續以相同網站來源、搜尋類型及日數記錄後續期間；若要評估措施，另保留發布時間與對照資料。');
    } catch(error) {
      observations.push('本次未產生期間差額。'); unknowns.push(`無法比較：${error.message}`);
      nextSteps.push('先修正比較條件，再產生報告；不要用不一致的期間總數判定成長。');
    }
  } else {
    inference.push('目前只有一段資料，可作為觀察基線，尚無期間趨勢可比較。');
    unknowns.push('沒有後續比較期間。'); nextSteps.push('加入同網站來源、同搜尋類型、同日數且不重疊的後續期間。');
  }
  if(!inference.length) inference.push('資料尚不足以進行期間趨勢解讀。');
  const sample=Boolean(samples.a || (after && samples.b));
  const title=sample?'成長觀察報告｜含合成範例':'成長觀察報告｜提供者聲明資料';
  const summary=assessment(before,after);
  summary.provenance=sample?'含合成範例：僅供測試，不是真實成長證據。':'提供者聲明資料：來源尚未向 Google 核實。';
  const sections=[['觀測',observations],['合理推論',inference],['未知',unknowns],['建議動作',nextSteps]];
  const markdown=`# ${title}\n\n資料用途：離線搜尋基線觀察；尚未連接 Google。${sample?'合成範例不可作為真實成長證據。':'來源尚未核實。'}\n\n## 先看這裡\n\n`+[summary.label,summary.detail,summary.provenance,`優先下一步：${summary.nextStep}`].map(escapeMarkdown).join('\n\n')+'\n\n'+sections.map(([heading,items])=>`## ${heading}\n\n`+items.map(x=>`- ${escapeMarkdown(x)}`).join('\n')).join('\n\n')+'\n';
  return {title,summary,sections,markdown};
}
