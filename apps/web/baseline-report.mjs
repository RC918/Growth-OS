import {compare} from './search-baseline.mjs';
import {saveSnapshot,loadSnapshot} from './baseline-snapshot.mjs';
const types={web:'網頁搜尋',image:'圖片搜尋',video:'影片搜尋',news:'新聞搜尋'};
const count=value=>value.toLocaleString('zh-TW');
const percent=value=>value===null?'無法計算（曝光為零）':(value*100).toFixed(2)+'%';
const signed=value=>(value>0?'+':'')+count(value);
export function growthReport(a,b,samples) {
  // Reconstruct from daily inputs; never trust caller-supplied aggregates.
  const checked=loadSnapshot(saveSnapshot(a,b,samples));
  const before=checked.a.result,after=checked.b?.result;
  const observations=[],inference=[],unknowns=[
    '網站來源、搜尋類型與匯出時間由提供者聲明，尚未向 Google 核實。',
    '未提供到站訪問、商業轉換或 AI 能見度資料，因此這些成果仍未知。',
    '未納入發布紀錄、對照組或其他影響因素，無法將差異歸因於內容或行銷措施。'
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
  const sections=[['觀測',observations],['合理推論',inference],['未知',unknowns],['建議動作',nextSteps]];
  const markdown=`# ${title}\n\n資料用途：離線搜尋基線觀察；尚未連接 Google。${sample?'合成範例不可作為真實成長證據。':'來源尚未核實。'}\n\n`+sections.map(([heading,items])=>`## ${heading}\n\n`+items.map(x=>`- ${x}`).join('\n')).join('\n\n')+'\n';
  return {title,sections,markdown};
}
