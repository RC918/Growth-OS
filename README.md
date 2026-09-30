# Growth OS

Good Morning Digital Co., Ltd. 的電商與貿易商獲客產品試作。正式品牌及網域尚待確認；目前產品工作標題為 **Growth OS**。第一個模組 **Visitor-to-Customer Leak Map** 從廣告導流後訪客離站的問題出發，先檢查公開著陸頁，再逐步接入經授權的漏斗資料。

## 目前可執行

| 路徑 | 內容 | 資料性質 |
|---|---|---|
| [`prototype/public-audit`](prototype/public-audit/README.md) | 本機公開 HTML 掃描、非同步 API 與報告頁 | 真實公開頁的有限靜態觀察；不是轉換率量測 |
| [`prototype/offline-proof`](prototype/offline-proof/README.md) | 行動、觀測與事件對齊的離線報告 | 隨附 CSV 全為模擬資料 |
| [`docs`](docs/) | 系統設計、API、SQL、產品規格與執行藍圖 | 設計文件，非已部署功能 |

只需 Python 3.12，從根目錄執行：

```bash
cd prototype/public-audit
python3 -m unittest -v test_scanner.py test_app.py
python3 app.py
```

開啟 <http://127.0.0.1:8080>。預設僅在本機監聽。`prototype/public-audit/STATUS.md` 列出功能與上線前缺口。

## 接下來

1. 確認產品品牌及新網域；不使用既有 Morning Ai 網站試點。
2. 建立可隔離的 Staging、工作區與網域驗證，完成安全及資料隔離驗收。
3. 接入有授權的 GA4、廣告與訂單／CRM 資料，才計算實際漏斗與轉換。
4. 在新產品站從零建立 GSC、GA4 與主要轉換事件，開始累積真實基線。

90 天現金試驗上限為 NT$100,000。此倉庫沒有連接任何客戶網站或帳號，沒有生產環境、付款流程或已驗證的成效數據。部署選型不採 Render。
