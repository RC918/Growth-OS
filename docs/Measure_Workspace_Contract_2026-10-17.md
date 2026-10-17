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
