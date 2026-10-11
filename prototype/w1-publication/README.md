# W1 → W2 發布準備切片

已保存的 W1 fact／draft／確切 Review 可接到既有發布預覽：顯示本版內容、來源快照與上一草稿差異、來源／版本依據，以及各項發布阻擋。只提供 preparation；synthetic 示範不等於真 W2 發布，Review 不等於發布授權。

## 2026-10-11 現用 W1 唯讀核稿引導

本輪由 `d19bc041e2d8d0fd46abc149d81fceb8cc73651a` 接續，只在現有 `/w1-workspace` 加入「現在可以先看哪裡」。導航讀既有草稿／Review／preview狀態，優先顯示讀取中、原操作待核對、無保存草稿、讀回失敗，再引導讀取預覽或聚焦描述比較／來源版本。來源變更、衝突、待確認與已有確切確認分別說明；導航不自動GET、POST、勾選、修改或確認，不把停用保存／確認／發布列為下一步。沒有新API、模型、storage或通用框架；W1僅有description，不沿用d19三欄DOM驗收。

`apps/web/w1-review-navigation.mjs` 是W1專用呈現；既有build只派生HTML定位、UI刷新與preview呈現狀態，missing/ambiguous新增hook拒絕。讀取數量／失敗旗標只供呈現，不是資料／權限狀態。原adapter、Auth、runtime config、SQL/gate及frozen共用preview皆未改；新增模組使W1包由14檔變15檔。

獨立驗證（repo根目錄）：

```sh
node delivery/w1-private/build.mjs
node --test prototype/w1-publication/navigation.test.mjs prototype/w1-publication/preview.test.mjs prototype/owner-workspace/url-publish-preview.test.mjs delivery/w1-private/adapter.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/w1-publication/verify.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/w1-private/login-route.test.mjs
```

新增2項契約驗證含原操作pending／busy／disabled target／Viewer、manifest全檔與frozen RC/R7 hash。原20項契約保留；兩尺寸實際W1路由驗確認／未確認／來源漂移／衝突／無草稿／refresh失敗保留文字、GET待回應、logout late response、鍵盤焦點與不搶焦點、無autoGET/POST、aria live屬性、44px與無溢出。原操作pending導航由注入狀態的DOM契約驗證；writer=false真W1路由不製造寫入pending。既有示範回歸照跑，但未新增示範，也不用它替代實際路由驗證。截圖 `/tmp/w2-preparation-w1-guidance-{1280,390}.png` 與既有JSON一起進CI `w2-preparation-evidence`。14組登入入口驗證是mock，沒有寄真信；未真人screen-reader驗收。

### 原Mac同Site部署交接（本輪不部署）

原Reviewer核定exact新HEAD後，原Mac用已存在正式Sites source helper開啟同一private Site的當前來源。以完整既有composite為基底，只替換 `/w1-workspace` 的HTML（`dist/index.html`）、`/w1-assets/product-fact.mjs`、`/w1-assets/url-publish-preview.mjs`，新增 `/w1-assets/w1-review-navigation.mjs`；以 [完整15檔hash](../../delivery/w1-private/SHA256.json) 核對這四個來源產物。保留其他既有W1/R7資產、已配置runtime、writer=false、gate與access audience；**不可整包覆蓋現用config為repo的null預設，也不把W1單包當整站部署**。更新composite manifest，核其餘檔byte-identical，沿原helper完成source/package/native private部署並記錄新Site source SHA與version；repo SHA不冒充Sites source SHA。不需Vercel/Git整合、Python API或新平台。

已實作／局部測試＝唯讀引導；未部署、待同HEAD CI及原Reviewer。實際查看私人草稿仍需有效既有W1 session；fresh-login仍是先前延期項，導航不補做登入、不重開寫入，既有synthetic產品與未發布限制保留。本包不是完整商家閉環。父依原部署權限安排Mac步驟，本Primary不自行發佈或開下一包。

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
- 由既有W1 build從 frozen `url-publish-preview.mjs` 派生呈現，保持原檔及RC manifest不變；本機示範也讀同一產物。W1 只有 description，不虛構 title／meta。來源快照、上一草稿、網站現況分開；擷取時間未知。更改答案／來源／Review、錯配身份／歷史依賴、讀取失敗、編輯、refresh 或 logout 使預覽失效。穩定的來源漂移／衝突以無有效Review及對應阻擋呈現。
- 在現有 W1 build 加入兩個讀取模組及當前結果頁掛接。部署候選由12檔變14檔；`SHA256.json` 覆蓋完整包。示範 fixture 不包含於部署包；runtime config、CSP、R7、Auth流程、SQL與寫入窗口不改。
- 缺少真內容、目標頁、平台、站點授權、本版發布意圖、現網基線與可信發布時間分別可見；發布按鈕永遠停用。沒有 dispatcher、POST 或自動發布路徑。

## 驗證界線與目前狀態

PLAN/CODE、contract、實際RUN、DOM、桌機／手機、讀取身份／tenant隔離及logout late-response均適用；瀏覽器攔截並核所有請求，W2路徑僅GET，無storage/cookie、無外部請求。實際部署路由測試使用 synthetic transport；直接驗 DOM 第2版、8項阻擋、唯讀狀態、Save／Review停用、失效清空與refresh恢復，不以未登入的測試端API代替瀏覽器權限證據。

DB變更、SAVE、真實fresh-session登入及真正發布不屬此切片，未執行，不列PASS；既有 W1 寫入驗收不重跑。Owner 已延後 fresh-login，仍未驗證。本候選未部署，不能宣稱Live Sites已可用或商家成效已成立。沒有遠端SQL/grant、重新開窗、寄信、真登入、模型或新增付費資源。R7/W1 gate不操作。既有delivery README所記P3 debt維持，不擴修。

Primary 完成局部 VERIFY 後交原 Reviewer，未自行最終驗收。後續真內容／平台／授權／發布／量測需獨立派工與所需批准。

首次 `221c149` 的push／PR CI因直接更改frozen預覽模組而失敗（internal-rc/contract.test.mjs的manifest hash檢查）。必要P2修正為W1 build限定派生呈現，恢復原檔bytes，不改hash基準或測試；重新核frozen檢查1項、20項契約及兩尺寸實際路由。無blind rerun。


### v10 入口失敗診斷增量（2026-10-11）

原 Mac 已讀回完整已部署 graph 的 200／JS MIME／來源身份；Cloud live Chromium 被環境 tunnel 阻擋，未取得 HTTP 回應。Owner 錯誤根因仍未知，需原 Mac 提供精確 deployed HTML（含平台插入）以隔離重現。此次只補 `w1-workspace-entry.js` 固定非秘密錯誤分類，不能稱入口已修好；不改任何 routing／CSP／config／Auth API，無自動重試／寄信。

獨立回歸：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/w1-private/login-route.test.mjs`，1280/390共24案。分類不印 raw exception／URL／stack，包含secret sentinel不外洩斷言。原Reviewer後，原Mac若部署此診斷包，只更新既有composite `/w1-assets/w1-workspace-entry.js`，依 `delivery/w1-private/SHA256.json` 核hash，保留其他v10資產與設定；不要求Owner console／終端機搬檔。正式部署／Owner端再次觀察仍由父安排。
