# CSV 匯入預覽｜Sprint 2 基礎

`validate.py` 是純本機函式，接收已經去識別、按日期與維度彙總的 UTF-8 CSV。指定來源與欄位映射後，檢查必要欄、數值、幣別、重複分段與檔案大小；空值保留 `null`，不當成零。`store.py` 再示範以 SQLite 交易儲存驗證結果、同鍵重試不重算，以及工作區範圍內的查詢。**這仍是本機工程原型，不計算真實漏斗。**

```bash
python3 -m unittest -v test_validate.py test_store.py
```

支援來源：`ga4`、`ad_platform`、`store`、`crm`；各來源只接受對應指標。必要映射：`report_date`, `source`, `medium`, `landing_path` 和至少一個該來源指標。可選 `campaign`, `device`, `currency` 及其他對應指標。輸入欄位名稱由映射指定；單檔限制 1 MB／10,000 列。

`store.py` 的工作區 ID 僅能由未來已驗證身分的服務端傳入；目前沒有登入、角色授權、網域驗證或 HTTP 入口。後續接 API 前仍須完成上述權限、病毒與個資檢查、欄位映射 UI、Postgres 交易與 RLS 驗證。請勿投入任何真實個資或憑證。
