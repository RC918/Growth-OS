# Review 持續啟用相容性盤點（離線，2026-10-18）

授權範圍：Owner 2026-10-18 原則同意隔離 Staging 持續啟用方向，僅授權實作盤點、差異審查、離線測試與可逆性驗證；**未授權修改 Staging DB 權限或正式啟用，未執行任何遠端 DDL/ACL**。基準 Commit：`457bc72`。

## 結論

既有 persistent 候選（`supabase/drafts/url_review/persistent/`）**不可直接套用於目前 Staging**：其啟用前置守衛有三項基準已過時，直接執行將按設計 fail-closed 中止（安全行為）。需先完成基準更新的離線修訂與獨立批准，才可談啟用。

## 已查證事實

1. **Review RPC 已存在於 Staging**：REST OpenAPI 列出 `/rpc/review_url_result` 與 `/rpc/save_first_result_draft`（bounded 時代已安裝 schema/RPC；目前對外關閉）。候選 `preflight.sql` 的「Review already installed…never replay」守衛會正確拒絕重放。
2. **Save ACL 衝突**：候選所有守衛要求四個 Save entry 對 anon/authenticated/service_role 全部 EXECUTE 關閉（`save: 'CLOSED throughout'`）。Phase 1 一般版保存已由 Owner 核准開放 `save_url_result_draft` 對 authenticated（實測 EXECUTE=true，鏈驗收 `328ee6f` PASS）。
3. **Save 本體雜湊衝突**：候選 `expected_save_prosrc_sha256` 源自舊 revision-bound owner-candidate 的 bounded 實作；目前部署的一般版實作經離線逐字比對，與 `supabase/drafts/url_result/proposal.sql` 本體完全一致（sha256 前綴 `3966372346`），與候選預期必然不同，`Closed Save body drift` 守衛會中止。
4. **Migration 計數過時**：候選要求 history 23→24→25→26；bounded 試驗後實際筆數必然已變，執行時須以 `state.sql` 全列對帳，不得假設。
5. **Authority 前置未驗證**：候選要求先撤銷 `audit_events`/`organization_members` 對 anon/authenticated 的直接寫入 ACL（TRUNCATE 不受 RLS 保護）；Staging 現況未在本輪讀取（需連接器唯讀核對，屬下一個授權包）。
6. **RLS/合約層相容**：Review 合約（同 org 目前 Owner、最新版、source/content/version digests、五項 checks、同 request 冪等）與現行 Workspace `readUrlReview`／保存綁定一致；derived Preview 已有 enabled/disabled config 候選，UI 側無缺口。

## 可逆性驗證（離線）

- `install-closed.sql`：建立函數後立即 revoke 全部 EXECUTE，未啟用前不可呼叫。
- `disable.sql`：revoke all 且不依賴 schema/body 未漂移（設計註明漂移時仍可停用）。
- `restore.sql`：重新核對封閉狀態後才 grant，為 enable 的受控重放，非自動回復。
- 候選 `candidate.test.mjs` 在 CI 以 PGlite 在歷史封閉基準上驗證完整生命週期（authority revoke→install→enable→disable），目前 CI 綠燈；此為離線證據，不代表 Staging 已啟用。

## 啟用前必須完成（下一個授權包）

1. 連接器唯讀執行候選 `state.sql` 等價盤點：實際 history 全列、Review 函數本體 SHA 與 `expected-schema.json` 比對、四個 Save entry 有效 EXECUTE、兩 authority 表 ACL。
2. ~~離線修訂候選基準~~ **已完成（Commit `988a0aa`，離線）**：Save 守衛改為「URL pair 對 authenticated 開放、anon/service_role/PUBLIC 閉鎖、first-result pair 閉鎖」＋一般版 body SHA（`39663723…e1f6b`，與已部署檔案逐字一致）；manifest/hashes 已重產，PGlite 生命週期測試在模擬一般版部署的 fixture 上 6/6 PASS，新增 Save ACL 漂移拒絕案例（撤銷 URL 開放、授予 anon 均拒絕 restore/enable）；**未恢復 bounded 實作**。
3. Owner 另行批准：exact commit/hashes、啟用窗口、停用/恢復權限後，才可依序執行 authority revoke→install（若已安裝則對帳不重放）→enable→部署 enabled config。

## 狀態

- 已實作（離線候選與守衛）：是。
- 隔離驗收通過：否（基準不相容，未執行）。
- 產品驗收通過：否。
- 已正式開放：否。Staging Review RPC 維持關閉，Workspace `urlReviewEnabled=false`。
