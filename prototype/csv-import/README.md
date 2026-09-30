# CSV 匯入預覽｜Sprint 2 基礎

`validate.py` 是純本機函式，接收已經去識別、按日期與維度彙總的 UTF-8 CSV。指定來源與欄位映射後，檢查必要欄、數值、幣別、重複分段與檔案大小；空值保留 `null`，不當成零。`store.py` 再示範以 SQLite 交易儲存驗證結果、同鍵重試不重算，以及工作區範圍內的查詢。**這仍是本機工程原型，不計算真實漏斗。**

```bash
python3 -m unittest -v test_validate.py test_store.py test_gsc_daily.py
```

支援來源：`ga4`、`ad_platform`、`store`、`crm`；各來源只接受對應指標。必要映射：`report_date`, `source`, `medium`, `landing_path` 和至少一個該來源指標。可選 `campaign`, `device`, `currency` 及其他對應指標。輸入欄位名稱由映射指定；單檔限制 1 MB／10,000 列。

`store.py` 的工作區 ID 僅能由未來已驗證身分的服務端傳入；目前沒有登入、角色授權、網域驗證或 HTTP 入口。後續接 API 前仍須完成上述權限、病毒與個資檢查、欄位映射 UI、Postgres 交易與 RLS 驗證。請勿投入任何真實個資或憑證。

## 搜尋曝光基線：離線資料預覽

`gsc_daily.py` 接受**人工整理後的標準化 CSV**，不是直接吃任意 Google Search Console 原始匯出。只接受 `date,clicks,impressions` 三欄、每日一列的網站資源整體數值；呼叫時另外提供 HTTPS 資源來源、單一搜尋類型（`web`、`image`、`video` 或 `news`）、選定日期範圍與含時區的匯出時間。這些來源資訊由輸入者聲明，原型無法向 Google 核實。

```csv
date,clicks,impressions
2026-09-01,2,10
2026-09-02,0,0
```

最多 1 MB、366 天；缺少的日期會列為**未知**，明確的 `0,0` 才是觀察到的零。完整、同一網站資源及搜尋類型、日數相等且無重疊的兩段期間，可以產生描述性點擊與曝光差額。此原型不寫資料庫、不連接 Google、不顯示真實流量；不可將網頁／查詢表格加總當成網站資源總數，也不可把差額解讀成施策帶來的效果或轉換。沒有正式網站、資源驗證及授權資料前，只能以合成數據驗證流程。

Search Console 官方參考：[報表匯出限制](https://support.google.com/webmasters/answer/12917991)、[成效報表指標與彙總方式](https://support.google.com/webmasters/answer/7576553)。

## 瀏覽器工具

`apps/web/search-baseline.html` 提供分頁內的 CSV 選檔、貼上預覽與兩段期間比較；不連接 API、不使用儲存空間，也不將內容傳出分頁。瀏覽器版接受三欄未加引號的標準化資料，數值與加總必須在 JavaScript 安全整數範圍內。修改欄位後，舊結果與比較立即失效；錯誤顯示在送出按鈕旁。範例與下載範本皆為合成資料。

執行瀏覽器資料契約測試：`node --test prototype/csv-import/search-baseline.test.mjs`。

保存檔功能：下載 JSON，包含一或兩段來源資訊、每日資料與範例標記。重新載入會檢查版本、結構、數值、大小與日期，再重新計算摘要；不接受保存檔附帶的加總數字。檔案沒有身分簽章，重新計算不代表來源經 Google 核實。關閉分頁前需自行下載；不寫入工作區或伺服器。
