# Supabase migration candidate｜尚未部署

依序執行 `migrations/202609280001_initial.sql` 與 `migrations/202609280002_tenant_rls.sql`。第一份是原始設計 schema 的快照，第二份啟用所有租戶資料表的 RLS、只讀政策，以及需要 Supabase Auth 身分的工作區建立函式。

**目前沒有連接任何 Supabase 專案或執行 SQL。** 本地沒有 PostgreSQL；CI 的合約檢查只檢查檔案內容，不驗證 SQL 語法、函式擁有者、RLS 實際隔離或部署相容性。不得直接對正式資料庫執行，先在獨立 Staging 套用與驗收。

## Staging 必測

1. 以匿名、A 組織 owner、A 組織 viewer、B 組織 owner 四種真實 Auth session 測試。
2. `create_organization` 未登入須拒絕；登入後須原子建立組織與 owner membership。限制建立頻率由服務入口負責。
3. A 成員可讀自己的組織；不能讀 B 的 `sites`、`scans`、`findings`、`import_batches`、`funnel_daily`、`recommendations`、`actions`、`audit_events`。非 owner 不能讀自己的稽核事件。
4. 從用戶端直接對所有租戶資料表嘗試 INSERT/UPDATE/DELETE，應全部拒絕；不能只測 API。匿名掃描記錄不能經資料庫用戶端直接列舉。
5. 驗證 `has_org_role` 的 SECURITY DEFINER 擁有者與 execute grants；撤銷登入／移除 membership 後，資料立刻不可讀。以匿名和一般 authenticated 使用者測試無法繞過政策。
6. 真正的匯入服務還需在使用服務角色前查成員權限、已驗證站點與組織關係；service role 繞過 RLS，不能視 RLS 為唯一防線。

完成時保存 migration 紀錄、DB 查詢結果、跨租戶負例、API 與端到端截圖／日誌（去除個資），連同部署 SHA 供 Owner 驗收。RLS 綠燈不等於全系統上線；DNS 驗證、授權匯入、佇列和掃描安全仍有獨立門檻。
