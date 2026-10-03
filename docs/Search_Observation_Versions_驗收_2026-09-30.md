# 搜尋觀測工作區保存與追溯

## 範圍

Growth OS 隔離 Staging 專案 `vhzryhibmpvglzcmfnaa`。沿用組織成員角色，不使用可自行編輯的 user metadata 決定權限。首頁離線工具不變；登入工作台新增 JSON 匯入與版本查看。

## 保存契約

- `search_observation_versions` 僅保存第 2 版標準化 JSON，來源為提供者聲明；每日資料及發布紀錄尚未核實。第 1 版檔案由客戶端重新驗證並轉為第 2 版。
- 独立 UUID、伺服器保存時間、操作者及稽核事件。保存時間不是發布時間；不覆寫先前版本。
- owner-only 私有 SECURITY DEFINER 寫入實作，空 search_path、明確 auth.uid() 與組織角色檢查；public wrapper 為 SECURITY INVOKER。anon 沒有執行權限。直接 INSERT/UPDATE/DELETE 未授權。
- RLS 僅允許組織成員讀取；owner 可新增、viewer 只讀。
- 每次保存有 request UUID，同組織相同請求及相同 payload 回傳同一版本；相同請求但不同 payload 拒絕。
- 伺服器驗證欄位結構、大小、日期、數值、安全整數加總、重複日、來源形式、搜尋類型、時區及措施路徑。資料不完整可保存，缺日仍為未知。
- 列表僅讀取最近 20 筆版本 metadata；點選才讀取所屬組織該版 payload，重新驗證及計算報告。更早版本仍保存在 DB，分頁導覽尚未實作。

## 驗證

新結構在交易內編譯、測試後回滾；套用 migration 後再次執行 `supabase/tests/search_observation_versions_staging.sql`，合成寫入與臨時角色關聯全數回滾。通過：合法保存、舊版不變、同請求重試、不同 payload 重試拒絕、稽核一次性、14 類錯誤 payload、同租戶 viewer 可读但不可寫、跨租戶拒絕、anon 拒絕、直接更新拒絕。

安全 advisors 在前後均只有既有 Auth leaked password protection 警示，沒有新增 RLS/function 安全警示；未修改 Auth 設定。

瀏覽器自動驗收 `prototype/owner-workspace/observations-ui.e2e.mjs` 使用合成 Auth/Data API transport，驗證桌面1280及手機390：匯入錯誤、待保存預覽、503重試同識別碼、歷史版本讀取、重新登入讀取、第二版不改舊版、viewer介面、登出清除、無橫向溢出。這不是新一輪真人 Magic Link／真 JWT端到端證據。

## 限制

保存檔不是網站驗證或施策因果證據。報告由保存來源以目前程式重算，尚未存不可變的渲染報告或連結已核准草稿。真實 GSC/GA4授權、試點網站及正式發布仍未接入。
