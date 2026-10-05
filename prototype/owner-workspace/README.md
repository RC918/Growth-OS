# Growth OS 測試工作台候選版

> 2026-10-04 現行指引：唯一[藍圖 v2.0](../../docs/AI_Company_Growth_OS_執行藍圖_v1.md)明定①URL 到保存／新 session 取回／確切版確認核心可靠→②執行端受控站單平台發布→③關聯量測→④Owner 自有真內容且開放搜尋站→⑤修正後外部商家。產品價值是網站改善落地與相關流量觀測，不限三欄文案；外部商家不是目前前提。已實作／隔離通過／線上通過／目前開放各見[PROJECT_STATUS](../../PROJECT_STATUS.md)，Save／Review 目前 closed。日常用既有 synthetic regression，不依賴 Owner email／2FA；下一工程補從 URL 起的完整隔離路徑，不擴 CSV。下文早期狀態與下一版建議為歷史紀錄，不是新操作授權。

2026-10-02 新增獨立離線合成草稿確認示範，入口與測試方式見 [Web 預覽說明](../../apps/web/README.md)。此頁只使用記憶體與手寫資料，沒有 Auth、模型或遠端保存；真實工作區確認後保存的整合仍待開發。產品依據沿用 [既有執行藍圖](../../docs/AI_Company_Growth_OS_執行藍圖_v1.md)，完成狀態見 [M1 驗收紀錄](../../docs/Goal_Intake_M1_驗收_2026-09-30.md)。下文未標示日期的待驗收項目屬早期候選版紀錄，應以該驗收文件的最新證據為準。

此介面同步至 `apps/web/workspace.html`，供獨立 Growth OS Vercel Preview 讀取。**owner 真實登入、讀取、新增與核准，以及 viewer 真實登入、唯讀介面、跨工作區讀取與 owner RPC 拒絕，均已完成瀏覽器驗收；逾期憑證等負向情境仍待驗收**。證據見 [`owner 與 viewer 工作台真實登入驗收`](../../docs/Owner_Workspace_Real_Auth_驗收_2026-09-29.md)。使用獨立 Growth OS Supabase Staging 的合成資料。頁面以同分頁記憶體保存短期 Auth access token，重新整理後需重新登入；瀏覽器只持有 publishable key，沒有 service-role key。不要輸入真實客戶資料。

登入候選流程改為 Supabase Auth 預設 Magic Link：`POST /auth/v1/otp` 指定 `create_user:false`，並指定當前 HTTPS 工作台的精確回跳網址。預設模板的 Supabase 確認連結會在回跳頁的 fragment 帶入 Auth session；頁面立即清除 fragment，再向 `/auth/v1/user` 驗證 access token 和讀取成員資格。只使用 access token，丟棄 refresh token，不寫入 localStorage/sessionStorage/cookie。連結須由可收信的既有帳號在同一瀏覽器開啟；重新整理後須重新取得連結。請先在 Staging Auth 的 Redirect URLs 中只加入預覽工作台的**精確** HTTPS URL，並核對 Magic Link 模板仍使用 `{{ .ConfirmationURL }}`；不要加入正式網域或廣泛的萬用字元。

登入後以 Auth user ID 篩選成員資格，取得唯一工作區；同組織其他可見成員不應計入自己的工作區數。owner 可儲存／核准企業資料、建立候選機會及審核；viewer 僅能檢視。資料讀取由 RLS 隔離，寫入呼叫既有 owner-only RPC。既有企業資料若關聯未驗證網站，預設不可儲存；擁有者必須先完成網站驗證，或在介面明確勾選解除該網站關聯，避免儲存時悄悄清掉 `site_id`。重新整理、逾期憑證與登出仍待真實瀏覽器端到端驗收。

本地程式檢查：`node --test prototype/owner-workspace/workspace-api.test.mjs`。它用模擬 Auth 和資料回應驗證登入連結不建立新帳號、精確回跳、查詢範圍、角色權限、RPC 請求及錯誤訊息，並確認預覽輸出檔案與原型逐字相同；結果不能取代真實瀏覽器與雲端 Staging 驗收。

2026-09-29 先前曾於 Staging 控制台確認：Site URL 是 `http://localhost:3000`、Redirect URLs 為空、自訂 SMTP 關閉；**此為設定前的歷史紀錄**。目前已啟用 Brevo SMTP，並將新預覽網址設定為 Site URL 和精確 Redirect URL。Supabase 預設寄信服務對非團隊成員有限制；不可為測試信件擅自把信箱加入具專案權限的團隊。

使用者目前沒有可供驗證的網域。短期 Staging 候選為 Brevo Free：先由使用者建立帳號、驗證一個可收信的寄件地址並建立 **SMTP key**（不是 API key）；若平台要求人工開通交易郵件，須先完成開通。Supabase Staging SMTP 預填 `smtp-relay.brevo.com`、port `587`、寄件名稱 `Growth OS Staging`；SMTP login 與 key 應只在供應商和 Supabase 的安全設定頁輸入，不寫入 GitHub 或對話。Brevo 對未驗證網域的免費信箱寄件者可能改寫 From，僅作驗收用途；正式產品上線前須用自有網域驗證寄件身分。寄信連結追蹤不得改寫 Supabase 確認 URL。

viewer 真實網頁唯讀與直接 API 權限拒絕驗收已完成；在同一工作階段，跨工作區讀取無資料、owner RPC 回傳 HTTP 403。既有示例帳號不能收信，不適合 Magic Link 驗收。先前於本機執行的 14 表 Auth/Data API PASS，只涵蓋登入與唯讀租戶隔離。

機會卡片展開後顯示來源類型、觀察時間、原始說明及審核理由／時間，資料分別來自同租戶的 `opportunity_sources` 與 `opportunity_decisions`。未接入 GSC、GA4 前，搜尋曝光與到站訪問明示未知；此清單沒有真實流量排名。來源和決策查詢達到 500 筆上限時會失敗，避免截斷後仍展示不完整的證據鏈。

下一版依執行準備順序顯示資料缺口、已核准可備稿、待審核及不採納，不推測需求量或流量。owner 可為有來源和核准決策的機會留下不可覆寫的內容草稿版本；viewer 只能讀取，草稿不會發布。版本查詢同樣在 500 筆時拒絕截斷呈現。版本資料庫回滾測試位於 `supabase/tests/content_draft_versions_staging.sql`，網頁測試可執行 `node --test prototype/owner-workspace/*.test.mjs`。新版預覽的真實 Auth 網頁互動驗收仍待完成。

最新草稿可由 owner 單獨核准或退回，理由和時間保存在 `content_reviews`。新版本不承接舊版本的核准；只有最新版本能新增審核紀錄。這是內部內容審核，並無公開發布或變更客戶網站的能力。可用 `supabase/tests/content_draft_review_staging.sql` 在獨立 Staging 做回滾驗證。
