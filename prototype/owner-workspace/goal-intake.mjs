// Version 1 is guided intake, not AI extraction or an executed growth plan.
export const intakeFields = Object.freeze([
  {key:'offering',label:'推廣內容',question:'你想推廣什麼產品、服務或作品？'},
  {key:'audience',label:'目標受眾',question:'你希望哪些人看見它？'},
  {key:'market',label:'市場與語言',question:'你優先想接觸哪個市場、使用什麼語言？'},
  {key:'channel',label:'流量渠道',question:'你想先從哪個渠道取得流量？第一版先支援網站自然搜尋；其他渠道也可以記錄。'},
  {key:'asset',label:'網站或連結',question:'有可以分享的網站或產品連結嗎？沒有也可以回答「尚無連結」。'},
  {key:'metric',label:'觀察指標',question:'你希望觀察什麼流量指標與期間？例如未來四週的搜尋點擊；不確定也可以說明。'},
]);
export const confirmQuestion='請確認下面資料是否符合你的目標。確認只完成資料收集，尚未建立計畫、發布或取得成長數據。';
export function intakeState(turns) {
  const answers={};let goal='';let confirmed=false;
  for (const [index,turn] of turns.entries()) {
    if(turn.version_number!==index+1 || typeof turn.answer_text!=='string' || !turn.answer_text.trim()) throw new Error('目標紀錄不完整，請重新讀取');
    if(index===0) {
      if(turn.question_key!=='goal') throw new Error('缺少原始目標');
      goal=turn.answer_text;
    } else if(turn.question_key==='confirm') {
      if(intakeFields.some(field=>!answers[field.key]) || turn.answer_text!=='確認') throw new Error('資料尚未完成確認');
      confirmed=true;
    } else {
      const field=intakeFields.find(field=>field.key===turn.question_key);
      const next=intakeFields.find(field=>!answers[field.key]);
      if(!field || (!answers[field.key] && next?.key!==field.key)) throw new Error('資料收集順序不正確');
      answers[field.key]=turn.answer_text;confirmed=false;
    }
  }
  const next=!goal?{key:'goal',question:'告訴我你正在做什麼，我們一起開始。'}:
    intakeFields.find(field=>!answers[field.key]) || (confirmed?null:{key:'confirm',question:confirmQuestion});
  return {goal,answers,confirmed,next,version:turns.length};
}
