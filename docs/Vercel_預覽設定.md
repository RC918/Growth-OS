# Vercel 預覽設定

2026-09-30 更新。範圍為 Growth OS 獨立測試環境；不改 morningai、owner-console、正式網域或付費設定。

- 專案：`growth-os-preview`，團隊 `morning-ai`；與既有網站隔離。
- 倉庫：`RC918/Growth-OS`；目前預覽分支 `feat/passwordless-workspace`。早期 `feat/web-preview` 已不是本輪工作分支。
- Framework Preset：Other；倉庫根目錄的 `vercel.json` 輸出 `apps/web`。
- Ignored Build Step：Only build pre-production；本輪確認部署為 Preview，未建立正式環境或正式網域。
- 頁面連接 Growth OS 測試 Supabase `vhzryhibmpvglzcmfnaa`，使用公開 publishable key 與分頁記憶體登入狀態；沒有 service_role／secret key。
- 只使用合成測試資料，禁止輸入真實客戶資訊；固定問題引導不代表 AI 理解、產稿、發布或成長。

## M1 部署與驗收進度

使用者已明確允許恢復本測試環境部署與驗收。應用提交 `a9d0c25` 已 Ready；`30325ef` 修正重複登入的測試導覽並加入遠端回滾 SQL，`apps/web` 與前一提交完全相同，後續預覽亦已完成。兩次新 CI 通過，包含桌面／手機合成 transport 的完整流程。

首次 M1 預覽：[新版工作台](https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html)。精確網址已經使用者批准並保存，設定頁讀回共 13 項，預設 Site URL 保持原值。真實 owner 保存／修正／重新登入讀回及 viewer 唯讀介面已驗收；新 RPC 的真實拒絕、401 與並行仍待驗收。本機另修正初次讀取完成提示，尚未部署。

新增 `growth_goal_intake` migration 已套用至上述測試 Supabase。遠端 SQL 回滾驗收通過，測試組織與問答未保留；過去觀測與機會資料保持原狀。完整證據見 [M1 驗收紀錄](Goal_Intake_M1_驗收_2026-09-30.md)。

2026-09-30 直接 API 後續：新問答 RPC 真實 viewer／跨租戶 403 與 API 層真實 401 後恢復通過；競爭保存出現 40001 重複與 504／逾時，並行驗收失敗。PT409 修正 migration 已在本機驗證，尚未套用或部署；M1 不放行。具體阻礙與最小下一步統一見 [M1 驗收紀錄](Goal_Intake_M1_驗收_2026-09-30.md)。
