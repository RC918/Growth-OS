# Growth OS 真實 Auth / Data API 隔離驗收（2026-09-28）

範圍：獨立 Growth OS Supabase 專案 `vhzryhibmpvglzcmfnaa`，僅使用兩個測試 Auth 帳號與合成租戶資料。沒有使用客戶資料、正式網域或 Morning Ai 資源。

## 執行與結果

- 兩個不同且已確認的 Supabase Auth 帳號建立成功，分別綁定測試租戶 A（owner）與 B（viewer）。
- 以各自密碼從 Vercel **暫時**驗收頁呼叫 Supabase Auth password grant，取得兩個真實 session JWT。頁面不持久化密碼或權杖，提交後清空輸入欄位。
- 每個帳號均透過 Data API 對 10 張租戶表各查一次自有租戶、一次另一租戶，合計 40 次 SELECT。兩個帳號跨租戶結果均為 0；自有租戶各表為 1，唯 viewer 的 audit_events 預期為 0。頁面顯示兩個帳號均 PASS。
- GitHub Actions 原型測試對驗收頁分支 commit `c760b88453a112d4a2f63f9a588c407a961cbdf0` 通過；Vercel Preview 部署顯示 Ready。
- 驗收後執行 `auth_fixture_cleanup.sql`，合成租戶剩餘數 0。暫時驗收頁隨後從分支移除。

## 邊界

這次驗證真實 Auth session 的 **SELECT** 可見範圍，連同先前交易回滾 SQL 測試的直接寫入拒絕。尚未驗證 token refresh、登入後撤銷成員資格、正式 server-side 寫入流程、網域所有權、CSV 匯入、付費或客戶資料。測試 Auth 帳號另由 Auth 管理介面清理或停用；不可把此 PASS 當成整體產品上線核准。
