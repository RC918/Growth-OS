# Growth OS M1 目標與問答保存驗收

2026 年 9 月 30 日。目前狀態為「獨立測試環境已部署，自動驗收通過，真實帳號與多人並行驗收未完成」。下列本機測試表保存最初驗收時的結果；恢復部署後的結果見文末。本文件只記錄實作與驗收證據，產品需求及路線圖仍以 [執行藍圖](AI_Company_Growth_OS_執行藍圖_v1.md) 為準。

## 實作範圍

在現有工作台新增逐步引導區，不全面重寫介面。保留使用者原始目標，再收集推廣內容、受眾、市場與語言、流量渠道、網站／連結及觀察指標。沒有連結可以回答「尚無連結」。固定引導明示未接入 AI，不從原話猜測事實；確認資料後顯示「待建立成長計畫」。

新 migration 由 Supabase CLI 建立為 `20260930112010_growth_goal_intake.sql`，新增 `growth_goals` 和 `growth_goal_turns`。本機實作階段尚未套用遠端；恢復部署後已套用至隔離測試 Supabase，詳見文末。每次回答／修正新增版本，保留原話與伺服器問題；修正取消既有確認，需再次確認。歷史版本無直接客戶端更新或刪除權限。

owner 保存透過 public invoker／private definer RPC，私有交易每次依目前成員關係檢查權限。Authenticated 只能讀取有成員資格的工作區；viewer 可讀不可寫；anon 無資料讀取或 RPC 權限。RPC 使用 request_id 去重、expected_version 拒絕過期寫入，與 audit_events 同交易。組織鎖序列化同組織寫入；真正多人並行仍待驗收。

API 依已確認的登入成員設定 organization_id。對話內容只以 textContent 顯示；沒有本機持久憑證或私密問答快取。重新登入後由資料庫讀回；登出清除畫面及待提交內容，延遲回應不得恢復前一工作階段。尚未提交的文字不承諾跨登入保存；HTTP 401 提示重新登入。

## 本機階段測試結果（歷史紀錄）

| 檢查 | 結果 | 證據與限制 |
|---|---|---|
| Node 資料與 API 回歸 | 21 項通過 | 既有 workspace API 與搜尋基線契約 |
| 新引導與 API | 4 項通過 | 無網站、確認、修正、順序驗證、API 組織範圍與 viewer 拒絕 |
| DOM 操作 | 1 項通過 | 不確定保存結果重試、跨工作階段讀回、不可覆寫修正、確認失效、延遲回應及 viewer 唯讀；不代表瀏覽器排版通過 |
| PostgreSQL WASM 引擎 | 9 組通過 | 所有 migrations 編譯、去重／不同 payload 拒絕、輸入與順序、版本衝突、直接寫入拒絕、同租戶 viewer 讀取、跨租戶讀寫拒絕、anon 拒絕及權限撤銷；auth.uid() 為合成 claims；僅排除早期 pgcrypto extension 安裝 |
| 原有 Python migration 靜態契約 | 8 項通過 | 原有 guardrails；不能取代新增 SQL 的實際執行測試 |
| 原生 PostgreSQL | 未完成 | 現有 Homebrew 路徑缺失，暫存測試副本修正後仍受沙箱 shmget 限制；未修改系統安裝或遠端資料庫 |
| 桌面／手機 Chromium | 未完成 | 已準備 1280／390px 流程測試，但 Chromium 啟動遭 macOS MachPort／Crashpad 沙箱限制，沒有取得畫面或宣告 E2E 通過 |
| 遠端 Supabase 真實登入／Data API | 未執行 | 新 migration 與程式未部署；既有 owner 觀測保存證據不替代新功能驗收 |

## 重現方式

開發測試依賴固定版本並保存 lockfile；它們不進入靜態產品的執行期。`npm ci --ignore-scripts` 後執行：

```bash
node --test prototype/owner-workspace/workspace-api.test.mjs prototype/csv-import/search-baseline.test.mjs prototype/owner-workspace/goal-intake.test.mjs prototype/owner-workspace/goal-panel.test.mjs
node supabase/tests/goal_intake_postgres.mjs
python3 -m unittest discover -s supabase -p test_migration_contract.py -v
node prototype/owner-workspace/goal-intake-ui.e2e.mjs
```

最後一項須有可啟動的 Playwright Chromium。本機啟動受沙箱限制；恢復部署後已由 Linux CI 執行並通過，對應提交與結果見文末。

## 待驗收與範圍護欄

隔離 Supabase schema 套用、SQL 權限／撤銷會員驗收與 CI 桌面／手機合成流程已完成。M1 放行前仍需使用真實登入驗證 owner 保存與重新讀取、viewer／跨工作區 API 拒絕、401 後恢復，以及真正獨立資料庫連線的多人並行。SQL 合成 claims 與瀏覽器合成 transport 不替代上述證據。

M2 計畫／工作卡、AI 理解與產稿、發布、真實成長資料仍未實作。現有企業資料核准不能被目標確認取代。保留 profile／機會／內容版本／審核／行動計畫／觀測功能與過去資料。本輪不改 morningai、owner-console、正式網域或付費設定。

## 技術參考

核對 [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[資料庫函式](https://supabase.com/docs/guides/database/functions) 與 [變更紀錄](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)。本機 SQL 檢查依 [PGlite API](https://pglite.dev/docs/api) 執行；該結果只代表此 PostgreSQL 引擎與合成權限情境，不宣稱遠端服務已部署或驗收。

## 恢復部署後的驗收進度

使用者於 2026-09-30 明確允許恢復 Growth OS 測試部署與驗收。應用提交 `a9d0c25aa47d0c530720ded07323a163416599ee` 已在 Vercel Preview Ready；後續提交 `30325ef5755084087150e8d46e466f3c8b7b57a3` 修正測試登入 helper 並加入遠端 SQL 驗收，不更改 apps/web。

初次 CI 的引導 E2E 在第二次登入失敗：同網址只變更 hash，沒有重新載入 acceptRedirect。測試加入不同 test_session query 後，[PR CI](https://github.com/RC918/Growth-OS/actions/runs/36711308913) 與 [push CI](https://github.com/RC918/Growth-OS/actions/runs/36711300665) 均成功；1280／390px 完成問答、未知連結、確認、跨載入讀回、修正保留、viewer 與延遲回應驗收。此層使用合成 Auth/Data transport，不能視為真實 JWT 證據。

新 migration 已在隔離 Supabase 套用成功。`goal_intake_staging.sql` 以既有測試使用者和合成 JWT claims，在同一交易建立測試組織／目標，驗證 owner 保存、重試、版本、審核事件、同組織 viewer 讀取、viewer／其他工作區拒絕、成員撤銷、anon／直接寫入拒絕，最後 rollback。回傳 PASS；確認回滾後新目標筆數為 0。資料庫授權查詢確認 authenticated 只有 SELECT，anon 無新表授權。Security Advisor 沒有新表 RLS／RPC 警告；現有 leaked-password protection 警告未改動，本工作流使用 Magic Link。

真實新版登入與 API 驗收仍待精確 callback URL 的確認，未將新設計或合成檢查寫成真實驗收已完成。預設 Site URL 不變；沒有正式網域或付費設定變更。

## 中斷恢復與無需真人的核對

2026-09-30 再次核對分支 `feat/passwordless-workspace`，應用與測試提交為 `30325ef`。其與 `a9d0c25` 的 `apps/web` 差異為空；沒有重做功能、migration 或部署。唯讀遠端檢查確認目標與問答各 0 筆、兩張表 RLS 啟用、authenticated 的 SELECT 授權各 1 項，anon／authenticated 的 INSERT、UPDATE、DELETE 授權合計 0 項。部署來源 bundle 的完整歷史驗證通過。

不依賴真人的本階段核對完成。待處理的精確登入返回網址仍為 `https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html`；未新增授權、變更 Site URL 或重新要求使用者手動登入。M2 與全面介面改寫保持待開發，不因本階段核對完成而標記 M1 全面放行。
