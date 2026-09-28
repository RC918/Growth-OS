# Supabase｜Growth OS Staging

依序執行 `migrations/202609280001_initial.sql`、`migrations/202609280002_tenant_rls.sql`、`migrations/20260928160322_growth_opportunities_v1.sql`、`migrations/20260928161802_review_growth_opportunity.sql`、`migrations/20260928162623_create_growth_opportunity.sql`。第三份新增 Business Profile、成長機會、來源證據與核准紀錄。所有新增表啟用 RLS，只對 authenticated 明確授予 SELECT；沒有匿名或直接客戶端表寫入。後兩份提供受限的資料庫 RPC，以登入身分核對 owner；建立入口只記錄 owner 自述的問題／研究筆記，核准入口原子更新有來源的提案、決策和稽核事件。核准只表示同意提案，不發布內容或對外執行。工作區建立與其他資料來源匯入仍需可信服務端。

已在 Growth OS 組織的獨立 Staging 專案 `vhzryhibmpvglzcmfnaa` 套用五份遷移。前 10 張表的 RLS 與真實 Auth/Data API SELECT 隔離已分別驗證。新增四表與兩個 RPC 的交易回滾驗收見 [`growth_opportunities_staging.sql`](tests/growth_opportunities_staging.sql)、[`review_growth_opportunity_staging.sql`](tests/review_growth_opportunity_staging.sql)、[`create_growth_opportunity_staging.sql`](tests/create_growth_opportunity_staging.sql)，均 PASS。測後提案、來源、決策和臨時身分均為 0。安全顧問未回報新表的 RLS 問題；受限 SECURITY DEFINER RPC 會產生設計上預期的警示，見驗收文件。Auth「Leaked Password Protection Disabled」為既有警示，正式用戶登入前需另行處理。

本地 CI 的合約檢查只檢查檔案內容，不代表完整權限測試。既有 10 表曾以真實 Auth session 驗證 SELECT；**新增四表與建立／核准 RPC 目前僅模擬 JWT claims 的 SQL 測試**，尚無真正的使用者 Data API 操作或 Web 端到端流程。不得將此資料庫接到公開用戶流或匯入真實客戶資料。

## Staging 必測

1. 以匿名、A 組織 owner、A 組織 viewer、B 組織 owner 四種真實 Auth session 測試。
2. 由可信服務端驗證登入身分後，原子建立組織與 owner membership；未登入須拒絕。限制建立頻率由服務入口負責。
3. A 成員可讀自己的組織；不能讀 B 的 `sites`、`scans`、`findings`、`import_batches`、`funnel_daily`、`recommendations`、`actions`、`audit_events`。非 owner 不能讀自己的稽核事件。
4. 從用戶端直接對所有租戶資料表嘗試 INSERT/UPDATE/DELETE，應全部拒絕；不能只測 API。匿名掃描記錄不能經資料庫用戶端直接列舉。
5. 驗證私有 schema 的 `has_org_role` SECURITY DEFINER 擁有者與 execute grants；撤銷登入／移除 membership 後，資料立刻不可讀。以匿名和一般 authenticated 使用者測試無法繞過政策。
6. 真正的匯入服務還需在使用服務角色前查成員權限、已驗證站點與組織關係；service role 繞過 RLS，不能視 RLS 為唯一防線。

完成時保存 migration 紀錄、DB 查詢結果、跨租戶負例、API 與端到端截圖／日誌（去除個資），連同部署 SHA 供 Owner 驗收。RLS 綠燈不等於全系統上線；DNS 驗證、授權匯入、佇列和掃描安全仍有獨立門檻。
