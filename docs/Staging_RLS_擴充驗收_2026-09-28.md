# Growth OS｜Staging RLS 擴充驗收

台灣時間 2026-09-28；僅在 Growth OS 獨立 Supabase Staging 專案 `vhzryhibmpvglzcmfnaa` 執行。可重跑的腳本為 [`supabase/tests/tenant_rls_staging.sql`](../supabase/tests/tenant_rls_staging.sql)。未連接或修改 Morning Ai。

## 實測結果

| 範圍 | 結果 |
|---|---|
| 資料 | 在一個交易內建立合成 A/B 使用者、組織及十張表的測試列；最終 `ROLLBACK` |
| SELECT | A owner 在十張表各看見 A 的一列；B viewer 在九張一般表各看見 B 的一列，不能讀 owner 專用的 `audit_events`；非成員及 anon 均看不到測試列 |
| 直接寫入 | 十張表的 UPDATE/DELETE 均影響 0 列；十張表各有有效欄位的 INSERT 均因 RLS 權限被拒；政策清單無寫入政策 |
| 撤權 | 刪除 A 的 membership 後，A 在十張表均看不到原資料 |
| 收尾 | 腳本回報 `PASS`；另查合成 Auth users、organizations、sites 均為 0 |
| Advisor | Security lints 為空 |

此次使用 PostgreSQL `SET LOCAL ROLE authenticated/anon` 與 `request.jwt.claim.sub` 模擬 PostgREST JWT；即使合成使用者暫時寫入 `auth.users`，**沒有透過 Supabase Auth 取得真正 session**。這證明 Staging 資料庫政策在上述條件下的行為，不代表瀏覽器 publishable key、Data API、登入流程或完整端到端授權已通過。

## 尚待放行的驗收

1. 使用真正的 Supabase Auth session，分別以兩名測試使用者呼叫 Data API，驗證各表 SELECT、撤權及拒絕寫入；確認公開 Data API 暴露及 GRANT 配置。
2. 建立可信的工作區建立、站點驗證及匯入 API；服務端不能把使用者提供的 `organization_id` 當授權證據。
3. 驗證 DNS TXT challenge、冪等匯入、錯誤回滾、刪除及稽核。上述完成前不接收真實客戶 CSV。

這份腳本使用固定的 `example.invalid` 測試值，只能在隔離的 Staging 執行。若中途有 SQL 錯誤，資料庫交易會中止；執行環境仍應確認交易已回滾，並檢查合成列數為 0。
