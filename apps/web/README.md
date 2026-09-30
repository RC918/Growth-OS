# Growth OS Web 預覽

首頁是靜態產品說明頁；`workspace.html` 是隔離測試工作台，連接測試 Supabase Auth／Data API 的合成資料。沒有公開掃描或匯入 API，也沒有分析碼或追蹤腳本；工作台只在分頁記憶體保存短期 access token。`noindex` 與 `robots.txt` 避免預覽頁被搜尋引擎收錄。

在專案根目錄執行：

```bash
python3 -m http.server 8081 --directory apps/web
```

開啟 `http://127.0.0.1:8081`。Vercel 以根目錄 `vercel.json` 的 `outputDirectory=apps/web` 發布靜態預覽。此頁不代表可用產品；後續 Next.js 與真正的授權流程需要另外驗收。

工作台候選程式與測試放在 [`prototype/owner-workspace`](../../prototype/owner-workspace/README.md)，並同步至此目錄供獨立 Vercel 預覽發布。機會卡片可展開來源與審核紀錄；GSC／GA4 等真實流量資料仍未連接。

搜尋觀測版本：`workspace-observations.mjs` 在登入後提供 JSON 保存檔檢查、新版本保存及最近 20 版查看。沿用同一分頁 Auth，不另開登入回呼路徑。操作訊息位於保存按鈕旁；登出清除待保存及已顯示資料。搜尋基線頁本身仍為離線工具。保存的是提供者聲明的原始來源、每日列、合成標記及發布紀錄，不代表網站所有權、Google 資料或真實發布已驗證。

## M1 本機引導切片

2026-09-30 新增的目標／問答引導僅在本機程式中；新 migration 未套用到遠端，既有預覽尚未更新。固定問題引導不代表 AI 理解或產稿，確認只完成資料收集。保留原工作台與所有既有版本／審核功能。進度及測試限制見 [M1 驗收紀錄](../../docs/Goal_Intake_M1_驗收_2026-09-30.md)。
