# Review 持續啟用 Staging 唯讀盤點（2026-10-18）

授權：Owner 本次僅授權唯讀檢查。本盤點未執行任何 DDL、GRANT、REVOKE、RLS 修改或啟用；探測呼叫均在函數第一道 Auth 檢查即被拒絕，不可能寫入。目標專案 `vhzryhibmpvglzcmfnaa`（隔離 Staging）。

## 已查證（REST／CLI 唯讀通道，本次實測）

| 項目 | 實際狀態 | 與候選 `988a0aa` 預期 |
|---|---|---|
| Review RPC 存在 | `/rpc/review_url_result` 已安裝 | 候選 README 已標記須先對帳、不得重放 install ✓ |
| Review 五欄位 | `content_reviews` 含 `url_review_request_id/source_digest/content_digest/version_digest/checks` | 與 `expected-schema.json` 欄位集合一致 ✓ |
| Review EXECUTE（anon/service_role） | 均回 `permission denied for function review_url_result`（閉鎖） | 符合候選閉鎖預期 ✓ |
| Save RPC（url pair） | `save_url_result_draft` 存在；anon/service_role 均 `permission denied` | 符合修訂基準（僅 authenticated 開放，另由 Phase 1 鏈驗收與連接器讀回證實）✓ |
| Save RPC（first-result pair） | `save_first_result_draft` 存在 | ACL 待 SQL 核對 |
| Measure RPC | `save_search_observation` 存在 | 不在本候選範圍 |

## 通道受限、尚未查證（ENV_CHANNEL_BLOCKED）

以下需要 SQL 層讀取，本環境的合法通道目前無法執行：直連 DB 在 sandbox 內連線停滯且無 DB 密碼（不索取）；Management API SQL 端點需 OAuth token 交換，該交換僅舊版 CLI 內部可做，不輸出憑證。**未因此繞過任何安全機制。**

- migration history 全列與筆數（候選工件的 23→26 計數守衛已過時；bounded 時代紀錄為 27，實際以讀回為準）。
- Review 兩函數與 Save 一般版的 `prosrc` SHA 是否與候選預期逐字一致。
- `content_reviews` 兩項 constraints（unique／shape）是否存在且定義一致。
- `audit_events`／`organization_members` 對 anon/authenticated 的直接寫入 ACL（bounded 時代紀錄稱 authority revoke 已完成，須讀回確認）。
- Review 對 authenticated 的有效 EXECUTE（推定仍閉鎖，須讀回確認）、first-result pair ACL、RLS policies 全列。

候選 `state.sql`（唯讀 SELECT）已備妥，可由具 SQL 通道者（例如先前執行 Staging 操作的連接器）一次執行完成對帳。

補充通道查證（同日）：舊版 CLI 的 Management API 指令（projects／api-keys）可正常運作；直連 pooler 在 sandbox 內 DNS 解析即失敗（`nodename nor servname`），且本輪未使用任何儲存於本機的連線密碼。新版 CLI 的 `db query --linked` 需要 `sbp_` 型 token，與既有 OAuth 型登入不相容；未請 Owner 貼上任何 Token。因此 SQL 層最快的合法完成路徑仍為：由先前執行 Staging 操作的連接器以唯讀方式執行一次 `state.sql` 等價查詢並回傳結果，或 Owner 另行核准啟用窗口時一併讀回。

## 最小變更方案（待 Owner 核准，本次未執行）

1. 以連接器唯讀執行 `state.sql` 等價盤點，逐項比對 `expected-schema.json` 與修訂後守衛；任一不一致即停止並回報，不自動修復。
2. 若全部一致：僅需單次 tracked `enable.sql`（對兩支 Review 函數 grant authenticated）＋部署既有 enabled config；不需重跑 authority revoke／install（若讀回確認已完成／已安裝），不需重做一般版保存 RPC。
3. 回復：既有 `disable.sql`（revoke all）即可關閉，回復流程已於 PGlite 與真實 PG17 CI 離線驗證；啟用後仍可由 Owner 隨時核准停用。
4. 啟用後的首次真人 Review 驗收範圍（帳號／版本／次數上限）由 Owner 在同一核准中指定。

## 狀態

- 已實作（離線候選與守衛）：是，且與一般版保存基準對齊（`988a0aa`）。
- 隔離驗收通過：離線部分是（PGlite／PG17 CI）；Staging 讀回對帳未完成。
- 產品驗收通過：否。
- 已正式開放：否。Staging Review 對 anon/service_role 實測閉鎖，Workspace `urlReviewEnabled=false`。
