# Growth OS 測試工作台候選版

此介面目前只在原型資料夾，**未部署到 Vercel 預覽專案**。使用獨立 Growth OS Supabase Staging 的合成資料。頁面以同分頁記憶體保存短期 Auth access token，重新整理後需重新登入；瀏覽器只持有 publishable key，沒有 service-role key。不要輸入真實客戶資料。

登入候選流程改為 Supabase Auth 預設 Magic Link：`POST /auth/v1/otp` 指定 `create_user:false`，並指定當前 HTTPS 工作台的精確回跳網址。預設模板的 Supabase 確認連結會在回跳頁的 fragment 帶入 Auth session；頁面立即清除 fragment，再向 `/auth/v1/user` 驗證 access token 和讀取成員資格。只使用 access token，丟棄 refresh token，不寫入 localStorage/sessionStorage/cookie。連結須由可收信的既有帳號在同一瀏覽器開啟；重新整理後須重新取得連結。請先在 Staging Auth 的 Redirect URLs 中只加入預覽工作台的**精確** HTTPS URL，並核對 Magic Link 模板仍使用 `{{ .ConfirmationURL }}`；不要加入正式網域或廣泛的萬用字元。

登入後從成員資格取得唯一工作區。owner 可儲存／核准企業資料、建立候選機會及審核；viewer 僅能檢視。資料讀取由 RLS 隔離，寫入呼叫既有 owner-only RPC。既有企業資料若關聯未驗證網站，預設不可儲存；擁有者必須先完成網站驗證，或在介面明確勾選解除該網站關聯，避免儲存時悄悄清掉 `site_id`。直接瀏覽器操作、重新整理、逾期憑證與登出尚未完成 Staging 端到端驗收。

本地程式檢查：`node --test prototype/owner-workspace/workspace-api.test.mjs`。它用模擬 Auth 和資料回應驗證登入連結不建立新帳號、精確回跳、查詢範圍、角色權限、RPC 請求及錯誤訊息；結果不能取代真實瀏覽器與雲端 Staging 驗收。

2026-09-29 於 Staging 控制台確認：Site URL 仍是 `http://localhost:3000`、Redirect URLs 為空、Magic Link 使用預設郵件模板、自訂 SMTP 關閉。Supabase 預設寄信服務僅允許寄給專案團隊成員，故兩個獨立且可收信的 owner/viewer 測試帳號需要自訂 SMTP，或重新設計不依賴電子郵件的驗收方式；不可為測試信件擅自把兩個信箱加入具專案權限的團隊。

後續需先確認 Staging 郵件可送達兩個使用者掌控的信箱、部署至隔離的預覽來源、加入精確回跳 URL，再執行 owner 與 viewer 的真實網頁操作驗收。既有 `test1@example.com`、`test2@example.com` 不能收信，不適合 Magic Link 驗收。先前由人親自於本機執行的 14 表 Auth/Data API PASS，只涵蓋登入與唯讀租戶隔離。
