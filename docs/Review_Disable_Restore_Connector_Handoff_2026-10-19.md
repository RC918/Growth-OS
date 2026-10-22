# Staging Review 停用／回復再驗證：連接器一次性交接包（2026-10-19）

## 目的與範圍

在隔離 Staging 專案 `vhzryhibmpvglzcmfnaa` 完成一次即時
停用→回復循環再驗證，證明已啟用的 Review 可安全關閉與恢復。
離線層已於 PGlite 與真實 PG17 CI 驗證；託管 Staging 即時循環
尚未執行，本包是唯一待辦。僅限此專案，禁止 Production。

執行者：具正式 Supabase 連接器權限者（同 Part A 通道）。
Muse 無 SQL 執行通道（MCP OAuth 受限、替代連線曾被
Owner 拒絕），不自行執行本包。

## 授權依據與停止條件

- 依據：Owner 先前有條件核准 Staging Review 啟用包，啟用包
  文件第 21 行已明定停用驗證與恢復重驗為驗收步驟。
- 若執行者判斷現有核准函不涵蓋本循環，先停止並向 Owner
  提出一次精確核准請求，不得自行擴權。
- 任一步驟輸出 exception、SHA 不符或狀態不如預期：立即
  停止後續寫入，保留當下狀態，回報原始訊息，不得重試
  或改用未審核 SQL。

## 執行前核對（唯讀）

1. 確認連接目標 ref 為 `vhzryhibmpvglzcmfnaa`。
2. 執行 `supabase/drafts/url_review/persistent/postflight-enabled.sql`，
   必須無 exception（Review 對 authenticated 為開、anon 與
   service_role 為閉、一般版 Save 基準不變）。
3. 讀回一般版 Save 本體 SHA 須為
   `3966372346e8d063278b3ef59ba7c8e68349a0b0a5b00f3e8188e357e79e1f6b`；
   migration history 須含 `20261018170133`。

## 循環步驟

1. 執行同目錄 `disable.sql`（內含閉鎖後自檢，一般版 Save
   基準守衛同時生效）。成功後執行 `postflight-closed.sql`，
   必須無 exception。
2. 合成驗證（停用態）：以既有合成 owner 帳號經正常 Auth
   呼叫 `review_url_result`，預期被拒（403／權限錯誤）；
   同帳號 `save_url_result_draft` 仍須成功，證明停用不
   影響保存。不得使用 Owner 私人帳號。
3. 執行同目錄 `enable.sql`（與 Part A 同一檔案，不得改版）。
   成功後執行 `postflight-enabled.sql`，必須無 exception。
4. 重跑既有 `supabase/tests/review_enable_acceptance.mjs`
   Part C 合成驗收，預期 9/9 PASS；清理合成資料比照
   既有流程。

## 證據回傳（不含任何 Secret 值）

- 每步 SQL 的成功／exception 原始結果。
- 停用態 Review 被拒與 Save 成功的一筆紀錄。
- Part C 9/9 輸出與清理結果。
- 執行時間、執行者通道、最終狀態（已恢復啟用）。

完成後由 Muse 更新 Checkpoint 並送獨立 Reviewer 核對；
未取得上述證據前，本項維持「離線已驗證、即時未驗證」。
