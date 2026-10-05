# Growth OS

Growth OS 優先服務電商／貿易商，現行北極星為「貼網址 → 第一份可用成果 → 確認／微調 → 授權發布 → 看懂實際效果」。網址是主要入口，只有必要缺口才詢問；對話是 fallback，plan/work-card 是內部治理。產品價值是完成有依據、可落地的網站改善並觀測相關流量；title/meta/描述是目前可能交付物，不是完整價值。產品路線與 M0–M6 的唯一依據為 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)；[系統設計](docs/Commerce_Growth_系統設計_v0.1.md)及 [目前狀態](PROJECT_STATUS.md)依其同步。Auth/RLS、租戶、版本、approval/audit、CI/E2E 與離線契約資產保留。新 URL 閉環尚未完成，現有 demo 不代表真實自動理解、發布或成效。

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

Owner 2026-10-04 16:32 UTC 已核定內部順序：①網址→成果→編輯→保存→重新登入取回→確切版本確認核心可靠；②執行端準備受控測試站／資料，完成一種平台授權、preview、publish、readback、失敗恢復；③關聯版本／目標頁／發布時間／改善前基線／後續觀測；④內部完整驗收後，在 Owner 自有、有真內容且開放搜尋的站做成效試點；⑤依結果修正後才做外部商家試點。外部商家不是目前工程前提，自有站／平台／改動範圍於試點階段確認，本次不授權改既有網站。

[使用者流程](docs/AI_Company_Growth_OS_執行藍圖_v1.md#user-product-flow)與[內部驗證順序](docs/AI_Company_Growth_OS_執行藍圖_v1.md#internal-validation-order)兩張圖分開表達，不增加使用者操作。驗收分功能可用、發布正確、數據可信、成效觀測、使用負擔；test PASS 不等於流量價值成立。狀態分已實作／隔離測試通過／線上驗收通過／目前開放，完整證據見 [PROJECT_STATUS](PROJECT_STATUS.md)；Save／Review 現為 closed，历史有界驗收不代表持續開放。

下一 Core 先補①單一路徑驗證：沿用既有 synthetic session regression，將 URL 產生成果接至保存、新 session 取回與確切版確認；不依賴 Owner email／2FA，不擴頁面 CSV 支線。其後轉②受控站發布，只有實際相依的真人／外部授權步驟才設 checkpoint，不全域停工。無關擴充延後，OpenAI Ads 僅未來渠道。

限 Growth OS 獨立環境，不改 morningai、owner-console、production、正式網域或付費設定；不採 Render。既有預算並非新增支出批准。未授權或未接線的發布／數據明示未知；草稿、匯出與內部完成不算發布。
