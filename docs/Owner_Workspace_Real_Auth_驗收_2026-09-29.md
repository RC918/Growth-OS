# Growth OS owner 與 viewer 工作台真實登入驗收（2026-09-29）

## 範圍

- 獨立 Growth OS 預覽專案及合成資料工作區 Fixture A（owner）與 Fixture B（viewer）。驗收沒有使用真實客戶資料。
- owner 從郵件連結登入、建立並核准一筆合成機會；viewer 從邀請郵件登入、讀取 Fixture B，並用真實登入狀態執行資料 API 權限診斷。
- viewer 權限診斷部署：`ba252a2f2e11de5fc3622db1d0e06645968c2bfa`，預覽網址 `https://growth-os-preview-lw255i0qm-morning-ai.vercel.app/workspace.html`。Auth 僅增加此部署的精確返回網址。

## 結果與證據

| 邊界 | 結果 | 觀察 |
|---|---|---|
| owner 真實登入 | PASS | 使用者在瀏覽器透過一次性郵件連結進入 Fixture A，頁面顯示 owner 權限與企業資料。成員資格查詢修正為依目前 Auth 使用者篩選，避免同一組織有其他成員時誤判。 |
| owner 建立與核准 | PASS | 使用者建立一筆合成候選機會並核准，畫面狀態、決策資料及稽核事件一致。 |
| viewer 邀請與登入 | PASS | 邀請郵件送達後，使用者在瀏覽器進入 Fixture B；頁面顯示「檢視者・僅可閱讀」，編輯欄位停用且不提供新增與審核操作。 |
| viewer 真實登入與跨工作區資料 API | PASS | 使用者於 22:04 台灣時間按「驗證檢視權限」；畫面回報「跨工作區讀取：通過（無資料）」。診斷用同頁記憶體內的真實 access token 查 Fixture A 的 `organizations`，回傳空陣列。 |
| viewer 真實登入與擁有者 RPC | PASS | 同次診斷回報「擁有者操作：通過（HTTP 403）」。向 `review_growth_opportunity` 發送故意無效的決策與不存在的機會 ID，伺服器拒絕 viewer；頁面不顯示 token 或錯誤本文。 |
| 診斷未修改資料 | PASS | 驗收後查詢 Fixture B 的決策與相關審核稽核事件均為 0；診斷用的機會 ID 不存在。 |
| 程式與部署 | PASS | 本地 `node --test prototype/owner-workspace/workspace-api.test.mjs` 8/8 通過；診斷 commit 的 GitHub Actions push 與 PR 兩次均 success；獨立 Vercel 預覽 Ready。 |

## 尚未驗收

- owner 權限撤銷後既有 token 的行為，以及逾期連結與逾期 token 等真實瀏覽器負向情境。
- 真實網站驗證、真實客戶資料、GA4/GSC/廣告整合、發布和流量成效。此結果不代表正式產品上線。

測試截圖由使用者在對話中提供。郵件連結、access token、SMTP key、測試信箱、Auth 使用者識別碼與資料庫識別碼均未寫入此文件。
