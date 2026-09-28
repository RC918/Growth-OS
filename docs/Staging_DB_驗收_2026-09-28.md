# Growth OS｜Staging 資料庫初驗

台灣時間 2026-09-28。目標為 Supabase「Growth OS」組織之獨立專案 `vhzryhibmpvglzcmfnaa`，區域 `ap-southeast-1`，組織方案回報 `free`。在操作前 `public` 無資料表，遷移清單為空。沒有接觸 Morning Ai 專案。

## 已完成的雲端證據

| 檢查 | 實際結果 |
|---|---|
| 初始 schema 遷移 | `growth_os_initial` 成功；紀錄版本 `20260928000329` |
| 租戶 RLS 遷移 | `growth_os_tenant_rls` 成功；紀錄版本 `20260928000638` |
| RLS 與政策 | `public` 10 張應用表皆 `relrowsecurity=true`，各有一項 `SELECT TO authenticated` 政策；無客戶端寫入政策 |
| 私有函式 | `private.has_org_role` owner 為 `postgres`，SECURITY DEFINER；`anon` 無 EXECUTE，`authenticated` 有 EXECUTE |
| Security advisor | `lints: []`（本次查詢），不代表所有安全性已通過 |
| 交易內隔離煙測 | 模擬 A/B 兩名登入角色與組織；A、B 各只能看一筆自己的 organization，無法取得對方 owner role；直接 INSERT organization 被拒絕 |
| 清理 | 測試包在交易中並回滾；其後查詢測試 Auth users 與 organizations 均為 0 |

## 尚未通過

- 尚未用**真正的 Supabase Auth session**、瀏覽器 publishable key 或 Data API 驗證。模擬 JWT claim 的資料庫角色測試不能替代這些證據。
- 尚未測完每張表的跨租戶 SELECT/INSERT/UPDATE/DELETE，以及撤銷 membership 後的實際存取。
- 尚未建立可信服務端的工作區建立與匯入 API、站點 DNS 驗證、永久佇列、檔案安全檢查或 Web Staging。
- 尚未連接 GA4、GSC、廣告、商店／CRM；無真實漏斗與轉換成效。

因此目前狀態是 **DB schema 與首輪 RLS 煙測完成，Staging 端到端門檻未通過**。不得匯入真實客戶資料或對外開放服務。
