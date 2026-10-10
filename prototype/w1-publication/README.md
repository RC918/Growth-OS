# W1 → W2 發布準備切片

已保存的 W1 fact／draft／確切 Review 可接到既有發布預覽：顯示本版內容、來源快照與上一草稿差異、來源／版本依據，以及各項發布阻擋。只提供 preparation；synthetic 示範不等於真 W2 發布，Review 不等於發布授權。

## Reviewer 獨立入口

在 repository 根目錄使用現有 Node／Playwright／Chromium：

```sh
node prototype/w1-publication/server.mjs
```

開啟 `http://127.0.0.1:4312/prototype/w1-publication/index.html`，不需登入。選「第 2 版不支援戶外：已確認」後讀取預覽，可看到第 1 版「支援」到第 2 版「不支援」的草稿差異。六種情境包括只有舊確認、來源更新、衝突、錯誤工作區、讀取失敗；失敗須清空前次結果，切回正常情境可恢復。此 server 僅 loopback、allowlisted GET；CSP connect-src none，沒有真實 Auth、模型、DB、站點或 publisher 呼叫。

```sh
node --test prototype/w1-publication/preview.test.mjs prototype/owner-workspace/url-publish-preview.test.mjs delivery/w1-private/adapter.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/w1-publication/verify.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/w1-private/login-route.test.mjs
```

CI 使用已安裝的 Playwright Chromium，省略 executable path。證據：`/tmp/w2-preparation-evidence.json`、`/tmp/w2-preparation-{1280,390}.png`；CI artifact `w2-preparation-evidence`。初次局部驗證20項契約／必要回歸通過；DOM弱斷言修正後，四組桌機／手機實際DOM與14組登入資源圖回歸通過。最終 exact HEAD／同HEAD CI 由交審回條提供，不沿用前一版本CI。

## 接線與失效規則

- `apps/web/w1-publication-preview.mjs` 只協調讀取；adapter 重驗 native user／單一 Owner membership，scope 限同 org／product，核對 fact、draft、來源版本、market／channel 和確切 Review，再重讀身份及 state，避免中途變動或 late response 被採用。
- 重用 `url-publish-preview.mjs`，W1 只有 description，不虛構 title／meta。來源快照、上一草稿、網站現況分開；擷取時間未知。更改答案／來源／Review、錯配身份／歷史依賴、讀取失敗、編輯、refresh 或 logout 使預覽失效。穩定的來源漂移／衝突以無有效Review及對應阻擋呈現。
- 在現有 W1 build 加入兩個讀取模組及當前結果頁掛接。部署候選由12檔變14檔；`SHA256.json` 覆蓋完整包。示範 fixture 不包含於部署包；runtime config、CSP、R7、Auth流程、SQL與寫入窗口不改。
- 缺少真內容、目標頁、平台、站點授權、本版發布意圖、現網基線與可信發布時間分別可見；發布按鈕永遠停用。沒有 dispatcher、POST 或自動發布路徑。

## 驗證界線與目前狀態

PLAN/CODE、contract、實際RUN、DOM、桌機／手機、讀取身份／tenant隔離及logout late-response均適用；瀏覽器攔截並核所有請求，W2路徑僅GET，無storage/cookie、無外部請求。實際部署路由測試使用 synthetic transport；直接驗 DOM 第2版、8項阻擋、唯讀狀態、Save／Review停用、失效清空與refresh恢復，不以未登入的測試端API代替瀏覽器權限證據。

DB變更、SAVE、真實fresh-session登入及真正發布不屬此切片，未執行，不列PASS；既有 W1 寫入驗收不重跑。Owner 已延後 fresh-login，仍未驗證。本候選未部署，不能宣稱Live Sites已可用或商家成效已成立。沒有遠端SQL/grant、重新開窗、寄信、真登入、模型或新增付費資源。R7/W1 gate不操作。既有delivery README所記P3 debt維持，不擴修。

Primary 完成局部 VERIFY 後交原 Reviewer，未自行最終驗收。後續真內容／平台／授權／發布／量測需獨立派工與所需批准。
