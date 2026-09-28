# Supabase｜Growth OS Staging

依序執行 `migrations/202609280001_initial.sql` 與 `migrations/202609280002_tenant_rls.sql`。第一份是原始設計 schema 的快照，第二份啟用所有租戶資料表的 RLS、只讀政策，以及私有 schema 的成員角色查詢函式。工作區建立需要後續可信服務端交易。

已在 Growth OS 組織的獨立空白 Staging 專案 `vhzryhibmpvglzcmfnaa` 套用兩份遷移。資料庫已回報 10 張 public 表啟用 RLS、各有一項 authenticated 讀取政策，安全顧問沒有警示。以交易內臨時身分模擬跨租戶讀取及拒絕直接 INSERT，測試後回滾；詳見 [`docs/Staging_DB_驗收_2026-09-28.md`](../docs/Staging_DB_驗收_2026-09-28.md)。

本地 CI 的合約檢查只檢查檔案內容，不代表完整權限測試；目前也沒有真實 Auth session、API 或 Web 端到端驗收。不得將此資料庫接到公開用戶流或匯入真實客戶資料。

## Staging 必測

1. 以匿名、A 組織 owner、A 組織 viewer、B 組織 owner 四種真實 Auth session 測試。
2. 由可信服務端驗證登入身分後，原子建立組織與 owner membership；未登入須拒絕。限制建立頻率由服務入口負責。
3. A 成員可讀自己的組織；不能讀 B 的 `sites`、`scans`、`findings`、`import_batches`、`funnel_daily`、`recommendations`、`actions`、`audit_events`。非 owner 不能讀自己的稽核事件。
4. 從用戶端直接對所有租戶資料表嘗試 INSERT/UPDATE/DELETE，應全部拒絕；不能只測 API。匿名掃描記錄不能經資料庫用戶端直接列舉。
5. 驗證私有 schema 的 `has_org_role` SECURITY DEFINER 擁有者與 execute grants；撤銷登入／移除 membership 後，資料立刻不可讀。以匿名和一般 authenticated 使用者測試無法繞過政策。
6. 真正的匯入服務還需在使用服務角色前查成員權限、已驗證站點與組織關係；service role 繞過 RLS，不能視 RLS 為唯一防線。

完成時保存 migration 紀錄、DB 查詢結果、跨租戶負例、API 與端到端截圖／日誌（去除個資），連同部署 SHA 供 Owner 驗收。RLS 綠燈不等於全系統上線；DNS 驗證、授權匯入、佇列和掃描安全仍有獨立門檻。
