# Growth OS Web 預覽

現行產品方向唯一依據為[執行藍圖 v2.0](../../docs/AI_Company_Growth_OS_執行藍圖_v1.md)：URL → First Useful Result → Review → Publish → Measure。下列舊 M1/M2 工作台與離線計畫是歷史工程資產／內部治理，不代表新版里程碑完成；不再以對話→Plan 作主入口或下一步。

首頁是靜態產品說明頁；`workspace.html` 是隔離測試工作台，連接測試 Supabase Auth／Data API 的合成資料。新增 first-result.html 的公開來源 API 最小切片；沒有匯入 API，也沒有分析碼或追蹤腳本；工作台只在分頁記憶體保存短期 access token。`noindex` 與 `robots.txt` 避免預覽頁被搜尋引擎收錄。

在專案根目錄執行：

```bash
python3 -m http.server 8081 --directory apps/web
```

開啟 `http://127.0.0.1:8081`。Vercel 以根目錄 `vercel.json` 的 `outputDirectory=apps/web` 發布靜態預覽。靜態伺服器只供頁面展示，不提供 `/api/product-source`。現行增量沿用靜態頁與 Python API；沒有預設 Next.js 重寫計畫。此預覽不代表完整可用產品，真實授權整合仍需另行驗收。

工作台候選程式與測試放在 [`prototype/owner-workspace`](../../prototype/owner-workspace/README.md)，並同步至此目錄供獨立 Vercel 預覽發布。機會卡片可展開來源與審核紀錄；GSC／GA4 等真實流量資料仍未連接。

搜尋觀測版本：`workspace-observations.mjs` 在登入後提供 JSON 保存檔檢查、新版本保存及最近 20 版查看。沿用同一分頁 Auth，不另開登入回呼路徑。操作訊息位於保存按鈕旁；登出清除待保存及已顯示資料。搜尋基線頁本身仍為離線工具。保存的是提供者聲明的原始來源、每日列、合成標記及發布紀錄，不代表網站所有權、Google 資料或真實發布已驗證。

## 歷史 M1 本機引導切片（非 v2 M1 完成）

2026-09-30 的本機切片紀錄已由後續隔離測試驗收更新。固定問題引導不代表 AI 理解或產稿，確認只完成資料收集。保留原工作台與所有既有版本／審核功能；目前狀態與歷史證據見 [M1 驗收紀錄](../../docs/Goal_Intake_M1_驗收_2026-09-30.md)。

2026-10-02 新增 `offline-draft-review.html`，可由工作台登入前或目標區開啟。兩個手寫合成案例提供來源檢視、修改、取消、重新確認，以及逐項追加並讀回記憶體版本。修改或來源／版本變更會使確認失效；保存下一項前須重新確認。此頁不登入、不呼叫模型、不存取遠端資料，CSP 禁止連線，也不使用瀏覽器持久儲存。重新整理或切換案例會重設模擬紀錄；完成兩項仍明示缺少四項必要資料，不代表完整目標確認或發布。串接真實工作區保存尚待開發。

離線檢查：`node --test prototype/owner-workspace/offline-draft-session.test.mjs`；桌面與手機驗收：`node prototype/owner-workspace/offline-draft-ui.e2e.mjs`（需 Playwright Chromium）。

取消會捨棄未保存編輯，重開須重新確認；已保存版本保留。瀏覽器測試包含實際 Tab／Shift+Tab／Enter／Space 操作，及僅在 localhost harness 注入的角色／目標／版本拒絕案例。這些是離線 UI 證據；Preview 的既有 SSO 保護使雲端 UI／部署內容一致性未驗證，不得算作 PASS。

`goal-draft-adapter.mjs` 是尚未啟用的目標面板／草稿契約 seam。只接受注入 API 與當前上下文；確認、保存前重讀，保持 proposal scope，owner 依欄位順序保存後讀回。現有工作台沒有傳入 adapter，也沒有新 UI 入口；offline demo 不使用它。替身檢查：`node --test prototype/owner-workspace/goal-draft-adapter.test.mjs`。本批沒有遠端寫入／Auth/RLS 驗收；固定兩個 goal 的真寫入方案待另行決策。若送出後讀回失敗，只清除本地確認，不推定服務端未提交或自動重試。


## 歷史 M2 離線計畫示範（內部治理，非 v2 第一可用成果）

`offline-growth-plan.html` 使用獨立手寫合成已確認目標，不接收草稿頁或真實工作台資料。支援來源查看、修訂、確認、模擬開始／完成／失敗／重試及本頁歷史；CSP connect-src none，無 Auth/model/DB/storage。契約與 session 19 項測試 PASS，1280px/390px E2E PASS。

本機：`node prototype/owner-workspace/growth-plan-ui.e2e.mjs`；此環境 Chromium 放在 /tmp，需加 `PLAYWRIGHT_BROWSERS_PATH=/tmp/growth-os-playwright`。真實保存／跨登入／Auth/RLS 未實作。

## URL-first 第一成果預覽

first-result.html 使用 /api/product-source；首頁提供主要入口。本機須啟動 prototype/public-audit/app.py，靜態 http.server 不提供 API。三項來源支持文本可對照、複製與匯出；快照只有本機／Preview SQLite 暫存，沒有跨登入保存或發布。`8f1f17c` 已由父獨立驗收 32 項 scanner/API 與 Chromium 145 桌面／手機 E2E（各 12 次真下載）PASS，詳見 [驗收](../../docs/URL_First_Result_驗收_2026-10-02.md)。

現行最小下一步是取得可核對的真實公開產品頁品質與 protected Preview 互動證據，不擴張通用 Plan／工作卡。最近 3 個 live 嘗試均停在 robots（0 商品頁／snapshot／preview），不算品質 PASS 或 unsupported 判定；[有界評估與最少 Owner 操作](../../docs/Public_Product_Quality_2026-10-02.md)列出精確候選入口及部署 SHA 核對前提。真頁品質、SSO 互動、跨登入永久保存、發布／量測仍未驗收；匯出不解除暫存容量。
