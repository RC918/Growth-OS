# Growth OS

Good Morning Digital Co., Ltd. 的流量與商業成長產品試作。正式品牌及網域尚待確認；目前產品工作標題為 **Growth OS**。核心方向是增加相關流量與點閱，優先電商與貿易商，保留未來擴展創作者的設計；轉換優化為後續能力。主要流程為「對話提出目標 → 收集必要資料 → 成長計畫與工作卡 → 草稿確認 → 執行進度 → 真實成長數據」。對話引導與保存已完成本機切片，尚未部署／完整驗收；AI 理解、計畫與執行新體驗仍待開發。第一試點仍聚焦有自營網站的電商與貿易商；既有 **Visitor-to-Customer Leak Map** 是流量進站後的轉換診斷子模組。產品需求與里程碑的主要依據為 [`執行藍圖 v1.7`](docs/AI_Company_Growth_OS_執行藍圖_v1.md)，技術需求見 [`系統設計`](docs/Commerce_Growth_系統設計_v0.1.md)；[`定位修正`](docs/Growth_OS_定位修正_2026-09-28.md) 保留決策理由。

## 目前可執行

| 路徑 | 內容 | 資料性質 |
|---|---|---|
| [`prototype/public-audit`](prototype/public-audit/README.md) | 本機公開 HTML 掃描、非同步 API 與報告頁 | 真實公開頁的有限靜態觀察；不是轉換率量測 |
| [`prototype/offline-proof`](prototype/offline-proof/README.md) | 行動、觀測與事件對齊的離線報告 | 隨附 CSV 全為模擬資料 |
| [`prototype/csv-import`](prototype/csv-import/README.md) | Sprint 2 的彙總 CSV 欄位驗證與預覽 | 本機預覽，未連接帳號或資料庫 |
| [`docs`](docs/) | 系統設計、API、SQL、產品規格與執行藍圖 | 設計文件，非已部署功能 |
| [`supabase`](supabase/README.md) | Postgres schema、租戶 RLS 與合成資料工作區 | 已在獨立測試專案套用；owner／viewer 真實登入及權限邊界已驗收，真實流量尚未接入 |
| [`apps/web`](apps/web/README.md) | Vercel 產品預覽與測試工作台 | 獨立預覽連接測試 Auth／Data API；只使用合成資料 |

只需 Python 3.12，從根目錄執行：

```bash
cd prototype/public-audit
python3 -m unittest -v test_scanner.py test_app.py
python3 app.py
```

開啟 <http://127.0.0.1:8080>。預設僅在本機監聽。`prototype/public-audit/STATUS.md` 列出功能與上線前缺口。

## 接下來

2026-09-30 本輪只更新文件與改造方案，暫停新增功能與部署。僅 Growth OS 獨立測試環境，不改 morningai、owner-console、正式網域或付費設定。

工程順序以藍圖 M0–M6 為準：保留現有權限、版本、審核及觀測；再開發目標／對話保存、成長計畫／工作卡、草稿與內部執行、觀測連結與來源核實。真實發布、真實數據、外部商家驗證及轉換優化分開驗收。草稿完成不等於發布，合成資料不等於成長。

90 天現金試驗上限為 NT$100,000。此倉庫沒有連接任何客戶網站或帳號，沒有生產環境、付款流程或已驗證的成效數據。部署選型不採 Render。
