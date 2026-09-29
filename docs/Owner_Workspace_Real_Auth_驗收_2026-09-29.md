# Growth OS owner 與 viewer 工作台真實登入驗收（2026-09-29）

## 範圍

- 獨立 Vercel 專案 `growth-os-preview` 的預覽部署 `1f7035fbba499f06eaedebcc6f4aec274c5a4412`，網址 `https://growth-os-preview-4nxy3oy1y-morning-ai.vercel.app/workspace.html`。
- 獨立 Growth OS Supabase 專案 `vhzryhibmpvglzcmfnaa` 的合成資料。Fixture A 的真實 Auth 使用者 `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e` 為 `owner`；Fixture B 的真實 Auth 使用者 `9dd82ae4-2263-4af6-bf6b-84085234b0e2` 為 `viewer`。
- 驗收本人從郵件連結在瀏覽器登入並讀取各自的測試工作區；owner 新增一筆候選機會並核准；viewer 頁面僅顯示讀取控制。沒有輸入真實客戶資料。

## 結果與證據

| 邊界 | 結果 | 觀察 |
|---|---|---|
| Auth 回跳 | PASS | 使用者於 19:21 台灣時間點擊新 Magic Link，進入新預覽部署；`auth.users.last_sign_in_at` 為 `2026-09-29 11:21:37.599965+00`。 |
| 工作區讀取 | PASS | 頁面顯示 `Growth OS Auth Fixture A`、`owner` 權限、既有企業資料與兩筆機會。RLS 下同組織有多個可見成員；修正前程式誤以可見成員總數是自己的工作區數，修正後以 Auth user ID 篩選成員資格。 |
| 候選建立 | PASS | 19:26 台灣時間，畫面機會數由 2 變 3；資料庫機會 `92a82f52-92f2-452c-a76d-2e389c07162e`，狀態 `candidate`，內容為「測試顧客想比較兩款商品」，信心 `low`。 |
| owner 核准 | PASS | 19:28 台灣時間，畫面狀態變成「已核准」；`opportunity_decisions` 的 `decision=approved`、理由「測試企業擁有者核准流程」、actor 為上述 Auth 使用者；`audit_events` 有相同機會的 `growth_opportunity_reviewed` 事件。 |
| viewer 邀請與回跳 | PASS | 20:09 邀請寄往使用者授權的 Gmail `+growthosviewer` 別名；Brevo 顯示 Delivered。20:18 台灣時間點邀請後直接進入同一預覽工作台；`auth.users.email_confirmed_at=2026-09-29 12:18:55.684946+00`、`last_sign_in_at=2026-09-29 12:18:55.692043+00`。 |
| viewer 讀取介面 | PASS | 使用者截圖顯示 `Growth OS Auth Fixture B`、`檢視者・僅可閱讀`、`Synthetic Trader B`；表單欄位停用，新增機會表單顯示只有 owner 可編輯或審核。 |
| viewer 租戶隔離 | 模擬 claims PASS | 在 Staging 以此 viewer UUID 模擬 `authenticated` JWT 且交易回滾：唯一自己的成員資格、Fixture B 可見、Fixture A 與其機會不可見，owner 角色判斷為 false。這不是從 viewer 真實 JWT 直接呼叫 Data API 的證據。 |
| 程式與部署 | PASS | `node --test prototype/owner-workspace/workspace-api.test.mjs` 6/6 通過；GitHub Actions `Python prototype tests` 通過；Vercel 預覽部署 Ready，commit status Vercel success。 |

## 尚未驗收

- viewer 真實 JWT 直接呼叫跨租戶 SELECT 與 owner-only RPC 的拒絕、owner 權限撤銷後行為。畫面上隱藏寫入操作不等同於 API 端拒絕證據。
- 重新整理後重新登入、失效 Magic Link、逾期 access token 等真實瀏覽器負向情境。
- 真實網站驗證、真實客戶資料、GA4/GSC/廣告整合、發布和流量成效。此結果不代表正式產品上線。

測試截圖由使用者在對話中提供。郵件連結、access token、SMTP key 和任何憑證均未寫入此文件。
