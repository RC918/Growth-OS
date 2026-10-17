# Measure → Workspace 契約對照 2026-10-17

## 既有 Workspace 機制（重用，不另建）
- 身分/租戶：Supabase Auth + owner-only RPC `save_search_observation`（organization 由已驗證身分脈絡決定），RLS 與 DB 端 `private.valid_search_observation` 再驗一次。
- 保存格式：snapshot v2 `{format:'growth-os-search-baseline', version:2, a, b, actions}`；dataset 為 `{meta:{origin,type,start,end,exported}, rows:[{date,clicks,impressions}], sample}`；不可變版本、request_id 冪等、actor 與稽核由既有 RPC 處理。

## 差異對照（GSC 模型 → Workspace）
| 面向 | GSC 儲存/讀回 | Workspace | 處置 |
|---|---|---|---|
| 欄位 | property_origin/search_type/coverage_*/exported_at/rows | meta.origin/type/start/end/exported/rows | 逐欄同名映射，rows 原樣 |
| 身分 | 原型 caller-key 對照（本機） | Supabase Auth 身分 | 正式接入只用 Auth，caller-key 不升級為正式機制 |
| 版本 | content_sha256 指紋 | snapshot version 2 + DB 版本列 | 以 format/version 對齊，DB 列為權威 |
| 冪等 | idempotency_key（org 內唯一） | request_id（RPC 冪等） | 接入時把匯入鍵映射為 request_id，不另建邏輯 |
| 衍生值 | 讀回重算總計 | DB 不收衍生加總、呈現重算 | 一致，無需遷移 |

## 已驗證 / 待驗證 / 待核准
- 已由程式驗證（離線）：`gsc_workspace.to_workspace_snapshot` 映射形狀與 DB 契約鍵集合一致、sample 必須明示、竄改列被再驗證拒絕；整合路徑 CSV→儲存→讀回→快照全通（test_gsc_workspace/test_gsc_integration）。
- 仍需隔離環境驗證：以合成帳號在既有 Staging 呼叫 `save_search_observation` 保存一筆映射後快照並讀回（非破壞性、合成資料）。
- 必須 Owner 額外核准：Staging 寫入執行本身、以及後續 Production 接入、UI 呈現接線與正式身分流程變更。

## 最短接入路徑
登入 Workspace 後由既有 workspace-api 以同一 RPC 保存映射快照，列表/讀回沿用既有版本機制，呈現沿用 baseline-report；不新增第二套身分、資料庫或 HTTP 正式入口。里程碑驗收：登入後能看到可信任（來源揭露完整）、可讀回的 Measure 結果。

## 實際 Workspace 流程驗收（2026-10-17 補記）
- 已完成：儲存讀回 → snapshot v2 → 既有 Workspace `loadSnapshot` → `growthReport` 實際呈現，合成資料全程通過（test_gsc_workspace_flow），登入後呈現所需的資料形狀與揭露已可操作；Staging Auth 實測仍待 Owner 核准後以合成帳號執行。
- 已完成真實任務清單（Checkpoint 索引）：W1 載入逾時防護 0053c50、robots 分類 5b97cab 與 API 接入 b0e9166、GSC 儲存 f2483c1、呈現契約 c390eee、Measure HTTP 21b8f64、Workspace 映射 435cec7；皆 CI 全綠與 Reviewer APPROVE，細節見各 Commit 與 PR #31，不重測。
- Watchdog 原生試運行啟動/停止：`node tools/headless/watchdog-patrol.mjs`（原生終端，Ctrl+C 或 24h 到期停止）；未經新的明確核准不啟用常駐排程。

## Staging 最終驗收準備（2026-10-17）
- 合成 Payload 已由實際程式路徑產生：docs/Measure_Staging_Payload_2026-10-17.json（sample 明示 true、來源 https://shop.example），形狀與既有 `search_observation_versions_staging.sql` 的驗收 Payload 契約一致。
- 執行方式（隔離 Staging、交易內回復、不留資料）：由具 Staging 連線權限者將本 Payload 填入既有 `save_search_observation` 驗收流程（比照 supabase/tests/search_observation_versions_staging.sql 的 owner 保存→viewer 只讀→跨租戶隱藏模式），登出後以新會話讀回並於 Workspace 報表檢視。
- 本環境無 Staging 連線憑證與登入狀態（僅有 psql/supabase 執行檔，無 env 連線資訊），實際 RPC 與真實 Auth 瀏覽器驗收標記 HUMAN_REQUIRED，不以離線或合成 transport 冒充；既有 CI 的 observations-ui 合成 transport 驗收與本輪 Workspace 流程驗收維持有效，層級分開。
