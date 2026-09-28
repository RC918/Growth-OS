# Growth OS Web 預覽

靜態產品說明頁，未連接 Supabase、公開掃描或匯入 API。沒有表單、cookie、分析碼或追蹤腳本；此版只供 Staging 介面審查。`noindex` 與 `robots.txt` 避免預覽頁被搜尋引擎收錄。

在專案根目錄執行：

```bash
python3 -m http.server 8081 --directory apps/web
```

開啟 `http://127.0.0.1:8081`。Vercel 以根目錄 `vercel.json` 的 `outputDirectory=apps/web` 發布靜態預覽。此頁不代表可用產品；後續 Next.js 與真正的授權流程需要另外驗收。
