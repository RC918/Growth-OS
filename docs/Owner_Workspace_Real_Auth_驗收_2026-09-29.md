# Growth OS owner 工作台真實登入與操作驗收（2026-09-29）

## 範圍

- 獨立 Vercel 專案 `growth-os-preview` 的預覽部署 `1f7035fbba499f06eaedebcc6f4aec274c5a4412`，網址 `https://growth-os-preview-4nxy3oy1y-morning-ai.vercel.app/workspace.html`。
- 獨立 Growth OS Supabase 專案 `vhzryhibmpvglzcmfnaa` 的 `Growth OS Auth Fixture A` 合成資料，真實 Auth 使用者 `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e`，角色 `owner`。
- 只驗收本人從郵件 Magic Link 在瀏覽器登入、讀取自己的測試工作區、新增一筆來源為企業主觀察的候選機會，並由同一 owner 核准。沒有輸入真實客戶資料。

## 結果與證據

| 邊界 | 結果 | 觀察 |
|---|---|---|
| Auth 回跳 | PASS | 使用者於 19:21 台灣時間點擊新 Magic Link，進入新預覽部署；`auth.users.last_sign_in_at` 為 `2026-09-29 11:21:37.599965+00`。 |
| 工作區讀取 | PASS | 頁面顯示 `Growth OS Auth Fixture A`、`owner` 權限、既有企業資料與兩筆機會。RLS 下同組織有多個可見成員；修正前程式誤以可見成員總數是自己的工作區數，修正後以 Auth user ID 篩選成員資格。 |
| 候選建立 | PASS | 19:26 台灣時間，畫面機會數由 2 變 3；資料庫機會 `92a82f52-92f2-452c-a76d-2e389c07162e`，狀態 `candidate`，內容為「測試顧客想比較兩款商品」，信心 `low`。 |
| owner 核准 | PASS | 19:28 台灣時間，畫面狀態變成「已核准」；`opportunity_decisions` 的 `decision=approved`、理由「測試企業擁有者核准流程」、actor 為上述 Auth 使用者；`audit_events` 有相同機會的 `growth_opportunity_reviewed` 事件。 |
| 程式與部署 | PASS | `node --test prototype/owner-workspace/workspace-api.test.mjs` 6/6 通過；GitHub Actions `Python prototype tests` 通過；Vercel 預覽部署 Ready，commit status Vercel success。 |

## 尚未驗收

- 第二個真實可收信帳號的 viewer 瀏覽器操作、跨租戶拒絕與 owner 權限撤銷後行為。
- 重新整理後重新登入、失效 Magic Link、逾期 access token 等真實瀏覽器負向情境。
- 真實網站驗證、真實客戶資料、GA4/GSC/廣告整合、發布和流量成效。此結果不代表正式產品上線。

測試截圖由使用者在對話中提供。郵件連結、access token、SMTP key 和任何憑證均未寫入此文件。
