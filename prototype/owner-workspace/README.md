# Growth OS 測試工作台候選版

此介面目前只在原型資料夾，**未部署到 Vercel 預覽專案**。使用獨立 Growth OS Supabase Staging 的合成資料。頁面以同分頁記憶體保存短期 Auth 憑證，重新整理後需重新登入；瀏覽器只持有 publishable key，沒有 service-role key。不要輸入真實客戶資料。

登入後從成員資格取得唯一工作區。owner 可儲存／核准企業資料、建立候選機會及審核；viewer 僅能檢視。資料讀取由 RLS 隔離，寫入呼叫既有 owner-only RPC。直接瀏覽器操作、重新整理、逾期憑證與登出尚未完成 Staging 端到端驗收。

本地程式檢查：`node --test prototype/owner-workspace/workspace-api.test.mjs`。它用模擬 Auth 和資料回應驗證查詢範圍、角色權限、RPC 請求及錯誤訊息；結果不能取代真實瀏覽器與雲端 Staging 驗收。

後續需先確認可信的產品登入部署來源，再執行 owner 與 viewer 的真實網頁操作驗收。先前由人親自於本機執行的 14 表 Auth/Data API PASS，只涵蓋登入與唯讀租戶隔離。
