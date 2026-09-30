# Proof of Growth｜離線原型

這是 AI Company Growth OS 第一階段的證據鏈原型。`data/` 裡都是**模擬資料**，只用來驗證資料口徑與流程，不能當成實際成效。僅依賴 Python 3 標準函式庫。

在本資料夾執行：

```bash
python3 proof.py --actions data/actions.csv --metrics data/metrics.csv --events data/events.csv --output output/report.json
```

報告將某個 action 發布前後的 GSC/GA4 觀測值與指定頁面的 lead 事件對齊。若有相同 `action_id`、頁面與有效時間窗的明確成交事件，才顯示「行動關聯收入」；否則收入欄為 `null`。前後差值和明確連結都不能單獨證明因果。`source`、`observed_at`、`status` 均保留。

匯入真實資料前，先由 Owner 定義各事件、提供合法存取的匯出與必要授權。不要直接把個資或 API token 寫入 CSV。
