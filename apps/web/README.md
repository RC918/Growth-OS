# Growth OS Web 預覽

首頁是靜態產品說明頁；`workspace.html` 是隔離測試工作台，連接測試 Supabase Auth／Data API 的合成資料。沒有公開掃描或匯入 API，也沒有分析碼或追蹤腳本；工作台只在分頁記憶體保存短期 access token。`noindex` 與 `robots.txt` 避免預覽頁被搜尋引擎收錄。

在專案根目錄執行：

```bash
python3 -m http.server 8081 --directory apps/web
```

開啟 `http://127.0.0.1:8081`。Vercel 以根目錄 `vercel.json` 的 `outputDirectory=apps/web` 發布靜態預覽。此頁不代表可用產品；後續 Next.js 與真正的授權流程需要另外驗收。

工作台候選程式與測試放在 [`prototype/owner-workspace`](../../prototype/owner-workspace/README.md)，並同步至此目錄供獨立 Vercel 預覽發布。機會卡片可展開來源與審核紀錄；GSC／GA4 等真實流量資料仍未連接。
