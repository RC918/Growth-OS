# Growth OS｜專案進度

更新時間：2026-09-28（台灣時間）。這是最後一次人工更新的快照，不代表有人在背景持續執行。

| 階段 | 狀態 | 可檢查的證據 | 下一道門檻 |
|---|---|---|---|
| Sprint 1：公開頁面診斷原型與系統設計 | 草稿 PR，待審查與合併 | [PR #1](https://github.com/RC918/Growth-OS/pull/1)，6 項本機測試與 GitHub CI 通過 | 程式審查；安全與 Staging 門檻另行驗證 |
| Sprint 2 基礎：彙總 CSV 匯入預覽 | 草稿 PR，依賴 Sprint 1 | [PR #2](https://github.com/RC918/Growth-OS/pull/2)，4 項新增測試與 GitHub CI 通過 | #1 合併後調整 #2 基底；再做登入、網域驗證、權限、持久化與冪等匯入 |
| Sprint 2 基礎：冪等匯入交易 | 草稿 PR，依賴 Sprint 2 預覽 | [PR #3](https://github.com/RC918/Growth-OS/pull/3)，本機交易與工作區隔離測試及 GitHub CI 通過 | 可信身分與網域驗證、正式 Postgres/RLS、真實資料接入前驗收 |
| Sprint 2 基礎：租戶 RLS 遷移候選 | 草稿 PR，依賴前三個 PR | [PR #4](https://github.com/RC918/Growth-OS/pull/4)，16 項本機／靜態檢查與 GitHub CI 通過；獨立 Supabase Staging 已套用遷移及首輪 RLS 煙測 | 補齊真實 Auth session 與完整跨租戶負例，保存 API／E2E 證據 |
| Web 產品預覽 | 草稿 PR，依賴前四個 PR | [PR #5](https://github.com/RC918/Growth-OS/pull/5)，靜態頁與 Vercel 設定、GitHub CI 通過 | 獨立 Vercel 專案 `growth-os-preview` 已連接 `RC918/Growth-OS`，`feat/web-preview` Preview 部署 READY；正式環境沒有上線 |
| 真實漏斗／正式產品站 | 尚未開始 | 無 GA4、GSC、廣告或訂單串接，無真實轉換數據 | 確認品牌與新網域；建立 Staging 和經授權的資料接入 |

## Owner 目前需要做什麼

Supabase 與 Vercel 已連接；Supabase Staging 位於獨立的 Growth OS 組織，未碰 Morning Ai。Web 預覽已在獨立的 Vercel [growth-os-preview](https://vercel.com/morning-ai/growth-os-preview) 專案部署，分支為 `feat/web-preview`，部署狀態 READY，可從 [預覽頁](https://growth-os-preview-p9lubz5i1-morning-ai.vercel.app/) 檢查；Vercel SSO 保護可能要求登入。正式環境沒有上線，正式品牌、網域與任何付費支出仍待另行核准。90 天現金試驗上限為 NT$100,000；目前沒有因本倉庫工作產生付費支出。

## 如何判斷進度

- **草稿 PR**：可檢視的工作成果，尚未合併或上線。
- **CI 通過**：自動測試通過，並不等於雲端 Staging 或真實客戶驗收完成。
- **合併**：程式納入 main；仍不等於部署。
- **Staging 驗收**：需 Deployment、API、DB、端到端證據，屆時另提供網址與結果。

對話回合結束後，工程工作不會自行在背景續跑。下次在同一對話說「繼續 Growth OS」或「進度」，會先核對 GitHub 最新狀態，再從待辦事項接續。此頁不是自動更新的儀表板，以 GitHub PR 與 Actions 的即時狀態為準。
