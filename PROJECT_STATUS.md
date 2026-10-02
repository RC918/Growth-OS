# Growth OS｜專案進度

更新時間：2026-10-02（台灣時間）。人工更新的快照；對話結束後不會在背景持續執行。

## 目前工程恢復

目前分支 `feat/passwordless-workspace`、Draft PR #19。基準 `0a36de7` 的兩次 CI（36896863481／36896871573）及 Preview checks 成功，包含離線草稿與 unwired adapter 回歸；不是完整遠端 adapter 或真實發布驗收。原生協調工具不影響本地工程。根目錄 package.json 無 build/lint/typecheck scripts；静態 Vercel build 僅 echo，不宣稱這三項品質驗證 PASS。最近舊失敗 36844043808 是 Edge 離線 module graph 嘗試下載 npm types；後續 shared pure validator 修正及目前 CI 已通過，不重做。沒有 AGENTS.md／CONTRIBUTING.md。

新增 M2 已確認目標／計畫版本／工作卡離線契約，13 項測試 PASS、語法與 diff 檢查 PASS；詳細範圍及未完成項目見 [M2 契約紀錄](docs/Growth_Plan_M2_離線契約_2026-10-02.md)。尚無持久化或工作台接線。下方 2026-09-28 表格與資料描述保留為歷史，最新細項以驗收文件及 PR checks 為準。

## 產品方向

第一目標是找出需求與內容機會，增加相關搜尋曝光及到站訪問；轉換診斷是第二層。第一試點為自營網站的電商／貿易商，創作者為後續驗證客群。正式品牌、網域與公開發布未決定。詳見 [定位修正](docs/Growth_OS_定位修正_2026-09-28.md)。

| 工作 | 已驗證 | 待完成 |
|---|---|---|
| 公開頁面診斷原型 | [PR #1](https://github.com/RC918/Growth-OS/pull/1) 的本機測試與 CI | 安全掃描 Staging API、授權測試網址 |
| CSV 匯入與持久化原型 | [PR #2](https://github.com/RC918/Growth-OS/pull/2)、[#3](https://github.com/RC918/Growth-OS/pull/3) 的預覽及交易證明 | 登入後真實匯入流程 |
| Supabase 資料與租戶隔離 | [PR #4](https://github.com/RC918/Growth-OS/pull/4)、[#6](https://github.com/RC918/Growth-OS/pull/6)、[#7](https://github.com/RC918/Growth-OS/pull/7)、[#8](https://github.com/RC918/Growth-OS/pull/8)；10 張表的交易回滾驗收與兩個真實 Auth session 的 40 次 SELECT 隔離檢查通過 | token refresh、撤銷成員資格、正式寫入與產品 API |
| 獨立網頁預覽 | [PR #5](https://github.com/RC918/Growth-OS/pull/5)、[#9](https://github.com/RC918/Growth-OS/pull/9)；Vercel Preview Ready | 正式品牌、網域、公開發布 |
| 流量成長主流程 | [PR #9](https://github.com/RC918/Growth-OS/pull/9) 校正藍圖與首頁文案 | Business Profile、需求／內容機會、人工核准、GSC/GA4 基線、週報 |

以上仍是相依的草稿 PR，尚未合併為正式產品。沒有已連接的客戶網站、真實流量改善、GSC/GA4 成果或付費功能。Growth OS 的測試 Auth 帳號目前以 Supabase 預設 24 小時封禁，合成租戶資料已清除；封禁到期會恢復帳號登入資格，但沒有租戶成員資格。

## 下一道門檻

先完成流量成長主流程的資料契約與可審查機會清單，再建立全新產品站的 GSC／GA4 量測。Owner 只在站點所有權、資料授權、正式品牌／網域、對外發布或付費決策時介入。90 天現金試驗上限 NT$100,000；目前未動用付費設定。

CI 通過不等於 Staging 全鏈驗收；對外展示成果需 Deployment、API、DB 與端到端證據。PR 與 Actions 為即時狀態來源。
