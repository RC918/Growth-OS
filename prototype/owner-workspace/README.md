# Growth OS 測試工作台候選版

此介面同步至 `apps/web/workspace.html`，供獨立 Growth OS Vercel Preview 讀取。**owner 真實登入、讀取、新增與核准的瀏覽器驗收已完成；viewer 與負向情境仍待驗收**。證據見 [`owner 工作台真實登入與操作驗收`](../../docs/Owner_Workspace_Real_Auth_驗收_2026-09-29.md)。使用獨立 Growth OS Supabase Staging 的合成資料。頁面以同分頁記憶體保存短期 Auth access token，重新整理後需重新登入；瀏覽器只持有 publishable key，沒有 service-role key。不要輸入真實客戶資料。

登入候選流程改為 Supabase Auth 預設 Magic Link：`POST /auth/v1/otp` 指定 `create_user:false`，並指定當前 HTTPS 工作台的精確回跳網址。預設模板的 Supabase 確認連結會在回跳頁的 fragment 帶入 Auth session；頁面立即清除 fragment，再向 `/auth/v1/user` 驗證 access token 和讀取成員資格。只使用 access token，丟棄 refresh token，不寫入 localStorage/sessionStorage/cookie。連結須由可收信的既有帳號在同一瀏覽器開啟；重新整理後須重新取得連結。請先在 Staging Auth 的 Redirect URLs 中只加入預覽工作台的**精確** HTTPS URL，並核對 Magic Link 模板仍使用 `{{ .ConfirmationURL }}`；不要加入正式網域或廣泛的萬用字元。

登入後以 Auth user ID 篩選成員資格，取得唯一工作區；同組織其他可見成員不應計入自己的工作區數。owner 可儲存／核准企業資料、建立候選機會及審核；viewer 僅能檢視。資料讀取由 RLS 隔離，寫入呼叫既有 owner-only RPC。既有企業資料若關聯未驗證網站，預設不可儲存；擁有者必須先完成網站驗證，或在介面明確勾選解除該網站關聯，避免儲存時悄悄清掉 `site_id`。重新整理、逾期憑證與登出仍待真實瀏覽器端到端驗收。

本地程式檢查：`node --test prototype/owner-workspace/workspace-api.test.mjs`。它用模擬 Auth 和資料回應驗證登入連結不建立新帳號、精確回跳、查詢範圍、角色權限、RPC 請求及錯誤訊息，並確認預覽輸出檔案與原型逐字相同；結果不能取代真實瀏覽器與雲端 Staging 驗收。

2026-09-29 先前曾於 Staging 控制台確認：Site URL 是 `http://localhost:3000`、Redirect URLs 為空、自訂 SMTP 關閉；**此為設定前的歷史紀錄**。目前已啟用 Brevo SMTP，並將新預覽網址設定為 Site URL 和精確 Redirect URL。Supabase 預設寄信服務對非團隊成員有限制；不可為測試信件擅自把信箱加入具專案權限的團隊。

使用者目前沒有可供驗證的網域。短期 Staging 候選為 Brevo Free：先由使用者建立帳號、驗證一個可收信的寄件地址並建立 **SMTP key**（不是 API key）；若平台要求人工開通交易郵件，須先完成開通。Supabase Staging SMTP 預填 `smtp-relay.brevo.com`、port `587`、寄件名稱 `Growth OS Staging`；SMTP login 與 key 應只在供應商和 Supabase 的安全設定頁輸入，不寫入 GitHub 或對話。Brevo 對未驗證網域的免費信箱寄件者可能改寫 From，僅作驗收用途；正式產品上線前須用自有網域驗證寄件身分。寄信連結追蹤不得改寫 Supabase 確認 URL。

後續仍須用第二個可收信帳號執行 viewer 真實網頁操作驗收。既有 `test1@example.com`、`test2@example.com` 不能收信，不適合 Magic Link 驗收。先前由人親自於本機執行的 14 表 Auth/Data API PASS，只涵蓋登入與唯讀租戶隔離。
