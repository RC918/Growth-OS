# INTRO-TRIAL-01：介紹候選離線交付

本包 live **NOT_RUN**。瀏覽器不呼叫模型；受控 runner 的非秘密 JSON 結果可載入 `/service-result.html` 的靜態子頁來源預覽，核對來源版本、原文引用與回條格式後顯示單一候選、原文／文字差異、理由。套用後可編輯與複製，仍是未獨立核實、未保存、未發布的草稿。引用存在不等於語義支持，回條格式通過不代表模型回條真實性已驗證。synthetic 結果明確顯示「未呼叫模型」；候選相同顯示「未產生改善」。來源或草稿變更使舊候選失效。

## 授權及 live gate

Owner 核准窗口 2026-10-08 16:16:40 UTC 至 2026-10-09 16:16:40 UTC；起點 `3609252bc1425459f47e294214d5ec761edd672b`，既有 `feat/private-host-bootstrap`／Draft PR28。單一批次三案例，固定 `gpt-5.4-mini-2026-03-17`、standard `service_tier: default`，完整 input 上限4000、output上限1500，最多六次 API request（3 count＋3 generation，失敗亦計次）；不重試、無 tools/background/redirect/額外抓URL，含稅總上限US$1。免費既有CI／Hobby Preview可用；不能新增儲值、訂閱、key或持久權限，也不啟動停用 AWS／Supabase。

`policy.mjs` 的 `LIVE_READINESS` 固定關閉。不得以 CLI/env 參數切換、填零或假定計數免費。標準模型公告價格為 input US$0.75／output US$4.50 每百萬token，單次 generation 保守預占 US$0.00975（三次US$0.02925，均未含稅與count）。官方 [模型頁](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[token counting](https://developers.openai.com/api/docs/guides/token-counting)、[count reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count) 未提供本包可核對的 count 價格／免費證據；稅上限也未知。不能用本地token估算加任意padding取代完整計數。

父代16:29:36UTC轉述已查看Owner截圖：Personal organization credit balance US$5.00、Auto-reload OFF，兩筆Growth OS Trial keys已過期。餘額不列未知；截圖不證明新runtime有效綁定，不沿用過期key。本環境只做 `OPENAI_API_KEY` 環境變數名稱存在性判斷，結果False，未讀值。需要父另核 action-time 安全批准的介面是**受控 Node runner process 的 `OPENAI_API_KEY` runtime binding**；不是前端、不是Vercel公開變數，不在本包建立或搬運秘密。即使後續安全綁定，count價格／含稅證據未齊仍不得live。

## 固定來源與執行

`sources.json` 固定三案例，沒有URL抓取功能。

- public-intro：父提供已授權只讀task的最小四欄短引文（頁名、H1、介紹、meta）。原頁HTML SHA256 `7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d`，13131bytes；本runner未取得或重新GET原HTML。來源是 `https://growthos.genman.work/ai-citation-check`，沒有完整HTML入庫。此處版本hash是父轉述來源證據，非本runner重新驗證的下載。
- synthetic-workshop、synthetic-library：明確虛構文字；版本為synthetic fields JSON的hash，不冒充真頁HTML快照。

Runner只接受 `prepare`、`live`、`readback`，固定狀態根 `/workspace/intro-trial-state/INTRO-TRIAL-01`，不提供journal-path/reset/retry overrides。**本包沒有執行 production prepare/live，也沒有建立正式額度journal。** gate齊備且批准仍有效時才依父下一步指令執行，不因本文件範例自動開跑。

`prepare` 以不可覆蓋marker及manifest建立一次批次；目錄、marker、journal皆fsync。`live` 核窗口、費率／稅、綁定證據與固定manifest，取得exclusive lock；每次先將request_id、payload hash、max cost與slot持久預占，再POST。count接受1–4000，generation需exact model/tier、completed、與count一致的usage和有效引文；任何未知或失敗保留slot/cost並停整批。成功不釋放worst-case預占；complete重入只讀。crash lock、部分journal或已dispatch歷史不可自動清除／重建／重送。`readback` 僅本機讀狀態，不發API。此journal是單一持久根的執行保障，不宣稱防止有寫權的人手動刪除整個資料根；根遺失須停批交父核對，不能換環境重建預算。

輸出 `<case_id>.candidate.json`，不得附key/header。導入UI需要當前source同URL/hash/四欄；過期、錯誤引文、超量或錯回條拒絕且保留草稿。public候選需先取得對應來源report；本包不重試被禁止的來源抓取，也不聲稱已完成真頁到live模型的端到端流程。

## 驗證與邊界

- PLAN/CODE：單一介紹候選與runner限制；frozen product HTML/JS/parser/hash/assert、Review核心、DB/Save/Publish未改。
- UNIT/CONTRACT：`node --test prototype/intro-trial/intro-trial.test.mjs prototype/internal-rc/contract.test.mjs prototype/public-audit/first-result-review.test.mjs prototype/public-audit/first-result-save-intent.test.mjs`，45 PASS（19新trial＋26既有frozen/Review/save-intent），涵蓋六slot、durable先寫、不同三source、UNKNOWN不重送、費率／綁定／期限／cap拒絕、並行、SIGKILL、manifest漂移、generation異常及引文／回條。
- BUILD/RUN/BROWSER：原生ES modules，無新增build步驟。`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs`：1280／390真loopback UI，候選差異／引用／理由、套用編輯複製、未改善、手動稿保留、偽引文與stale拒絕、來源失效；保留原每尺寸22次真下載回歸，無外連/storage/error/overflow。
- Parser/API回歸：`prototype/public-audit` 下 `python3 -B -m unittest -v test_product_source.py test_product_api.py test_service_source.py`，41 PASS。
- DATABASE/AUTH/SAVE/LOGOUT/FRESH SESSION/LOGIN/READBACK/TENANT：本包無此變更，N/A；不能拿synthetic候選當真登入／持久保存驗收。runner journal readback由離線測試覆蓋，與產品DB不同。
- Live模型品質／真頁重抓／live費用：NOT_RUN。模型產出尚未證明改善，排名或流量成效未驗。免費CI／Preview exact receipts交父另附，Preview ready不等於產品驗收。
- VERIFY之後交**既有Reviewer**，Primary不自行APPROVE、不新增task、不開始下一Core。

CoreMilestoneProgress=1僅指來源綁定候選載入→審閱→編輯／複製離線能力；不是live rewrite成功。下一動作由父決定。
