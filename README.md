# Growth OS

Growth OS 優先服務電商／貿易商，現行北極星為「貼網址 → 第一份可用成果 → 確認／微調 → 授權發布 → 看懂實際效果」。網址是主要入口，只有必要缺口才詢問；對話是 fallback，plan/work-card 是內部治理。首版成果為带來源的產品頁 title/meta/描述改善包。產品路線與 M0–M6 的唯一依據為 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)；[系統設計](docs/Commerce_Growth_系統設計_v0.1.md)及 [目前狀態](PROJECT_STATUS.md)依其同步。Auth/RLS、租戶、版本、approval/audit、CI/E2E 與離線契約資產保留。新 URL 閉環尚未完成，現有 demo 不代表真實自動理解、發布或成效。

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

藍圖 v2.0 已確認，新增 URL 主入口、來源快照／產品事實與第一份文本預覽最小切片，見 [驗收紀錄](docs/URL_First_Result_驗收_2026-10-02.md)。本機 scanner server 的 /first-result.html 提供 API 接線；Preview 使用 /api/product-source。來源暫存不等於跨登入保存。繼續按新 M1–M6：URL 理解 → 第一可用成果 → Review → Publish → Measure → 完整試點。先做安全公開來源／產品事實最小切片及成果預覽，不先擴張通用計畫／工作卡或對話 onboarding。

限 Growth OS 獨立環境，不改 morningai、owner-console、production、正式網域或付費設定；不採 Render。既有預算並非新增支出批准。未授權或未接線的發布／數據明示未知；草稿、匯出與內部完成不算發布。
