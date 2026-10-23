# Growth OS Console 增量原型／URL 接線

## 2026-10-23 Preview 核稿檢查接入實際建置（獨立 Draft）

Owner 要求直接接續已授權工程；本次 Core：Console 匯出的成果進 Workspace 時，實際 Preview 也必須檢查目前文字與來源證據，再允許保存。基準為 PR #41 `15fa2011bf0208f76498e6ce831882e9aea33558`，新分支 `codex/preview-claim-guard-20261023`，不修改 Dot 原分支或正式環境。

已核對該基準 immutable Preview 的 `/workspace.mjs` 仍 import `workspace-api.mjs`，只在獨立 candidate 中使用的 claim guard 未進部署流程。現在共用 fail-closed transform，實際 build 將 Workspace 接至 `claim-guarded-workspace-api.mjs`，並在 handoff／檔案匯入 accept 時檢查 saved claim context；凍結的 apps/web 與 115 個 hash 不變。Review flag 保持預設關閉；client 檢查不能代替 server enforcement／RLS，也尚不接受缺少可驗證 provenance 的模型輸出。

驗證：26 項 Node contracts，包括實際產物拒絕矛盾宣稱且零 POST、合法 full payload 保存／登出／新測試 session exact readback、tenant／權限、unknown GET-only、bridge／flag／打包隔離。瀏覽器 harness 改走 configured Preview build → bridge → flag，不再用獨立 Console overlay；回條明列 synthetic backend／UI flag override，另保存最終產物 hashes。更新後桌機／手機瀏覽器執行交同版 CI；本端瀏覽器下載限制未解除，沒有重試下載或冒稱本機 E2E PASS。

基準 PR #41 run `39925972989` 的 Console browser step 已 PASS，整體 FAIL 是後續 auth-session fixture 測試仍固定舊三模組 includeFiles。本次同步更新為具名九模組，涵蓋 product／service 兩入口，保留並擴及所有模組的 fixture/bypass 禁入檢查；不跳過測試。這是同一打包修正的過期斷言，非真 Auth 失敗。

Verification loop：PLAN/CODE/contracts/build PASS；browser/desktop/mobile 新版待 CI；synthetic Save→logout→fresh session→readback／permissions PASS；真 hosted Auth／DB／模型／發布未驗，不宣稱 Beta 完成。Vercel connector 存取已於重新連線後恢復，先前 403 是歷史阻礙。獨立 Reviewer 待交審，本次保持 Draft，不自我 APPROVE；沒有 merge、手動 deploy、修改 secret／付費模型操作。


## 2026-10-23 接手：乾淨環境驗收與來源函式打包

### 後續 CI 失敗與有界修復（保留原失敗）

PR #41 原 HEAD `1506a7961eee4d41e6e7b403ba6ac976d2eadc0b` 的 Python PR run `39923961309`／job `120315684229` 失敗於 fresh-session browser step；bundle、build 與 12 整合契約均已先通過。直接讀取實際 log：spawn 無錯、程序未退出，10 秒截止時 DevTools 檔仍未就緒；`/usr/bin/chromium` 指向 runner 預裝 `/usr/local/share/chromium/chrome-linux/chrome`，原 workflow 只在該路徑不存在時才改連 Playwright，故先前安裝的專案瀏覽器不一定被使用。stderr 有 DBus 訊息，但不足以斷定它就是根因，不盲目重跑求綠燈。

同 PR 的有界修復：採用專案 Playwright 套件解析的固定瀏覽器（仍保留明確的 executable override），不再依賴 runner 預裝 binary 或 sudo symlink；就緒檢查在 30 秒內要求完整有效的 DevTools port／browser path，程序先退出立即失敗，不重啟瀏覽器或跳過任何產品斷言。新增缺半行 endpoint／正常就緒／無效 port 截止／程序退出反例。CI 固定保存啟動 stderr、狀態、requests 與驗收回條，避免失敗暫存遺失。原 run 仍為 FAIL，不宣稱已證實舊 Chromium 根因全解。

本機更新後 13 integration＋2 build contracts PASS、diff check PASS。本環境 Playwright browser 下載未取得有效 ZIP，沒有重試或更換下載路徑，因此完整新瀏覽器驗收留待同版 GitHub CI，不能稱已本機驗過。

另 Owner 已完成 Vercel 官方 device 授權（成功截圖），但本端 CLI 的後續憑證交換被執行環境政策阻擋：Network access to https://api.vercel.com:443 was blocked by policy。未取得本端成功登入回條、不重啟登入或換路繞過；這與連接器 project/team 403 分開，無需 Owner 重複授權同一代碼。

Owner 在原對話確認已交代 Dot 交接並授權本端直接開始。接手固定基準為 PR #38 `ffe45632a127a1561868d8ca4e108460d85a8f51`，使用獨立 `codex/beta-primary-20261023` 分支；未修改原工程分支、PR #35/#40、未合併或手動部署。公開 Issue #39 是 Beta 追蹤入口，具體私人交接回條未出現在 repo，不宣稱已讀到不存在的回條。

本包處理兩項接線／交接缺口：

- 乾淨 checkout 實跑 `node --test delivery/growth-console/persistence-integration.test.mjs` 為 11 PASS／1 FAIL：唯一失敗為讀取前位作者固定 `/workspace/.../pristine/.../workspace.mjs` 路徑不存在。改為直接核對原 CI 已固定的 SHA256 `9ba67576e59dc06479c0c0a48c00c0165d80e0f04631da1a090cc9100dd1ab06`，並移除 CI 的 sudo 複製步驟。不是複製當前檔案自比，也不修改 115 個 frozen 檔案或 hash。
- 原 `vercel.json` 顯式 includeFiles 不含商品 handler 必需的 `first_result_api`／`robots_policy`／`error_classify` 等依賴，服務 handler 也缺 `error_classify`。只把原 includeFiles 匹配檔案與 API 入口複製到空目錄、用 Python `-I -B` 新程序執行，分別重現缺模組。補為 9 個具名 runtime 模組，涵蓋原服務與 declared-product 分支；沒有全目錄 wildcard、測試或秘密檔案。新增打包測試已接既有 CI，執行 GET readiness、錯誤 POST 415、合成來源抽取，並拒絕任何 socket 操作。這證明明列依賴可獨立執行，**不是已證實 Vercel 線上必定缺檔**：平台自動追蹤是否曾補入其他檔案，本輪未取得部署內容，保留未知。

修後驗證：12 整合契約＋2 既有 Preview build 契約 PASS；兩個 source-bundle 測試（含兩個 handler 正例與移除依賴反例）PASS；39 個既有 first-result/service/product API 回歸 PASS；git diff --check PASS。新 bundle 測試不讀原 checkout 模組，無外網／模型／租戶資料操作。既有 localhost HTTP 回歸使用原 synthetic source。此包沒有 UI／Auth／資料庫／保存契約行為修改，未重跑桌機手機瀏覽器，不能冒稱本輪完整產品驗收。

接手時原 #38 CI 的新增整合契約與 fresh-session 瀏覽器步驟已通過，整體 Python workflow 尚在執行，不重跑或改寫原失敗。官方 Vercel protected URL 工具針對現行 Preview 的存取，於 read_protection_bypass 階段收到 403 forbidden（project/team scope），未進入應用 API；沒有重試或換 route。線上驗收須恢復既有連接器對 Morning-Ai／growth-os-preview 的適當存取；不要求私人 Token、不修改 Deployment Protection。

四層狀態：本包已實作、上述本機驗證已通過；新提交 CI／Preview 結果另核；未手動部署、未驗線上可用。獨立 Reviewer 本輪取證尚未完成，保持 Draft、不自行 APPROVE。下一產品主線仍是真模型／來源、真持久保存及同版託管流程，不把此必要打包修正算完整 Beta，也不新增永久排程或費用。

Owner 2026-10-11 10:52:28 UTC 批准；沿 `feat/private-host-bootstrap`／PR28、原Primary與Reviewer。基準 `2dfc699e2143f2c7b23b71b4f20ecd95256f8f24` clean。兩份Library來源已以read/full完整讀取：

- `Growth_OS_Web_UI_Spec_2026-10-11.md`，libfile_b6149ddb49bc8191bd12ee3bd53276c7，18,149 bytes／230行。
- `Growth_OS_Optimization_Report_Dot_2026-10-10.md`，libfile_43d6cafb71b481919b744b2a9a117f6f，26,651 bytes／336行。

沒有將Library內容移植成另一藍圖／治理框架，也未建立新Site。唯一產品路線仍為repo v2.0。

## 可操作成果

原生HTML／CSS／ES modules。左導覽、中央來源／三欄對照、右側唯一必要核對、右下角本頁作業狀態；手機狀態列保留獨立區域，不覆蓋CTA。六場景位於「互動原型場景（合成資料）」：開始、執行、待確認、失敗、完成、回訪。合成模式顯示醒目橫幅、禁止URL提交，場景切換不發API請求／不跑計時假進度；完成場景的勾選是明示合成狀態，不是代商家核稿。

真網址模式 POST 到原 `/api/product-source`，使用原scanner／product parser／有界 ephemeral SQLite，無模型；只接受與原request URL、完整引用／來源bytes／version一致的成果。復用 `first-result-review.mjs` 與 `first-result-payload.mjs`，不改frozen bytes。confirm仍是 `page_only`／未持久保存；來源或內容變更、取消、離線、晚回覆不沿用舊確認。只停止等待，不聲稱執行端已取消。

右下角的taskId、階段、最後事件來自同一browser-owned操作狀態及真request／response／review事件，不是後台任務回條。回訪是同頁切換回目前版本；刷新／新context回空，不用localStorage、cookie或聊天歷史冒保存。

## 實際能力映射與未解相依

| 能力 | 復用與本包狀態 | 開放界線 |
|---|---|---|
| URL→有來源成果 | 原Python API、安全robots／DNS／peer／大小／時限，已接新UI；隔離HTTP→parser→SQLite→UI通過 | 真public URL本輪一次讀取 `https://scrapeme.live/shop/Bulbasaur/`，停在 `robots_unavailable`，未繞規則；沒有真來源成功證據 |
| 來源／推論／未知 | 原snapshot與typed evidence完整核對，引用可查 | 網站陳述未獨立驗真；無模型理解 |
| 三欄編輯與exact確認 | 原Review契約；失效、晚回覆、保留輸入已驗 | 僅本頁，未保存、未工作區核准、未發布 |
| 保存／權限／fresh-login | 不建立新writer，不發tenant操作 | writer gate關閉；W1 live登入P2仍未知／未修，原Auth驗收不能外推 |
| 任務／恢復／回訪 | 當前頁面request state；未知與最後事件如實呈現 | 無持久背景執行、離頁續跑、新登入恢復承諾 |
| 發布／量測 | 僅顯示未發布、資料未接／unknown | 不新施工、不填零、不宣稱成效 |
| Sites | 7檔靜態candidate，沿同私有Site正式packaging | 靜態包不含Python API；Sites服務端執行路徑未接，不能以W1 GET證明真URL可用 |

未申請新模型／費用／secret／持久存取／DB grant／production／原網站修改。真URL可用性尚未達成，不能把本原型稱為完整live閉環；後續由父核既有受支援API hosting能力，不改安全規則或另建平台。

## 獨立驗收

```sh
node delivery/growth-console/build.mjs
node --test delivery/growth-console/task.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/growth-console/console.e2e.mjs
```

CI省略本機browser路徑，用已安裝Playwright Chromium。合約覆蓋精確page-only receipt、修改失效、同頁回訪、單請求、取消／離線／late回覆、來源URL錯配／hash偽造、失敗保留編輯、六場景無API、副作用與產物hash。瀏覽器以原隔離fixture（network合成；HTTP／parser／SQLite／UI真執行）驗1280／390／320、鍵盤focus／Space／Enter、收合回焦點、200%文字、44px控制、reduced motion、重要live-region、taskcard不遮CTA。mobile 320×200%發現固定viewport中頂列／狀態列最小內容高度擠壓中央，兩次局部調整仍失敗後RCA量測確認；可用高度不足時改為整頁流動，保留文字尺寸，桌機手機全回歸通過。另驗精確Sites路由與7檔資產圖，後端404如實顯示不可用、保留網址，合成場景仍可操作。本機test_app初次執行目錄錯誤，從其既有prototype/public-audit目錄執行即通過，未改測試。

PLAN→CODE→UNIT／BUILD／BROWSER／desktop+mobile適用。tenant DB／SAVE／LOGOUT／fresh-session LOGIN→persistent READBACK不適用這個匿名page-only增量，未執行且不報PASS；原viewer／跨tenant安全契約不變。量測與發布未開，不是本包施工完成條件。原型合成證據、真URL未完成與live入口未知分列。

## 本機與同Site交接

本機用既有server：

```sh
COMMERCE_GROWTH_DB=/tmp/console-public-sources.sqlite3 python3 -B prototype/public-audit/app.py
```

開 `/growth-console.html`。這是原API的真安全讀取路徑，來源可讀性由原scanner判定；沒有自動讀取示範網址。

原Reviewer同HEAD後，原Mac以既有Sites正式helper對原私有Site完整composite做additive更新：`growth-console.html`→`/growth-console`，其餘6檔→`/console-assets/<filename>`；不新增公開Site，不取代 `/w1-workspace` 或R7，不改configured runtime／writer／gate／audience。完整bytes見 `SHA256.json`。若未接PythonAPI，頁面失敗必如實顯示服務不可用；只能交付原型，不能宣稱真URL線上流程。

Repo SHA與Site source SHA分開；本包不部署、不merge。圖片 `/tmp/growth-console-{1280,390,320}.png` 為內部QA，CI artifact `growth-console-evidence`。原2dfc699兩筆CI38132459974／38132455522已success且實際logs核對；其diagnostic不是live登入修復。

## 真URL讀取回條與零新增費用接線判定

本次唯一public URL：`https://scrapeme.live/shop/Bulbasaur/`；由production `product_source.build_snapshot`→`scanner.fetch_public_html`→`fetch_following_redirects`／`fetch_once` 讀取 `https://scrapeme.live/robots.txt`，未使用fixture、cookie、Owner token、代理或模型。返回 `robots_unavailable`，原始detail為 `Robots rules could not be checked; scan stopped.`。此文字對應scanner的例外分支，並非「已取得非200 robots」分支；來源產品頁尚未進入讀取。該次沒有保留底層exception cause／HTTP headers／status，故**HTTP是否曾收到回應未知**，不能寫成已證實HTTP403或完全無HTTP。

正式同路有界重試使用次數＝0；public讀取attempt＝1。本輪不再重試或換真URL。可安全恢復＝保留UI網址／既有成果與unknown，先核執行环境具備原DNS→公開IP→peer/TLS pinning與robots讀取能力；日後有明確環境恢復證據／批准才沿原scanner有界重试並記錄非秘密transport cause。不可換代理、略過robots、繞拒絕或直接抓產品頁補成果。

能力核對：Sites技能runtime是Cloudflare Workers／HTTP外連，不提供原Python入口與raw TCP peer pinning的直接執行能力；靜態來源包也不含Python函數。既有 `vercel.json` 已声明兩個Python API，但Vercel存取問題仍hold，未新probe，不能假設該後端已部署／可用或保證零費用。

最小可行接線方向是保留原Python來源服務及安全契約，在**已存在、已核實零新增費用且可用的執行環境**提供同一 `/api/product-source`，Console保持同源相對路由；同私有Sites若做前置入口，需正式同站服務路由轉交該已核准端點，而不是瀏覽器跨來源／CORS繞路。相依包含：既有可用Python host、原scanner必要網路能力、來源快照有界暫存、同站路由、正式packaging及同版本端到端驗證。本輪未找到已核實且可直接套用的host/路由，因此**沒有已證實零新增費用的Sites線上接線**，不實作新的hosting／security設定／付費資源。可立即使用且無新增資源的是既有本機Python server原路測試；這也不等於production。將scanner改寫Worker須重新證明DNS/redirect/peer/robots等安全等價，超出本原型包，不能當小UI補線。

## 2026-10-11 frozen identity 修復／診斷撤回

a458 的 CI 38139605516／38139601174 均在 step29 frozen RC identity 失敗（jobs 114470549750／114470536551，實際logs已讀）。product_api.py 與 scanner.py 均屬 frozen manifest；前包聲稱不改frozen有誤。修正版用本包精確反向patch將11個程式／測試／產物檔恢復ccfc46c bytes，manifest/hash不動，frozen契約先PASS；不是改hash解鎖，也未reset/forcepush。原adapter無直接提供handler內部cause的hook，故不重構／monkeypatch，診斷與相依Console分類撤回，通用robots_unavailable的底層原因仍unknown。

父代已釐清：舊唯讀cause未知也涵蓋於原路徑一次bounded診斷授權，待原Reviewer通過再讀robots；允許後才讀原產品頁。401/403／安全錯誤／仍未知皆停，不換route/IP/tool、不再重試。本輪未發真URL請求，attempt1/retry0；未部署，runtime4b3／Sitev11不變。以下保留a458歷史測試與失敗前記錄，非目前功能或授權判定。

## 2026-10-11 原 scanner 失敗診斷增量（a458歷史，已撤回）

12:27 Owner 推進包起點 ccfc46c。`robots_unavailable` 保留相容 code；`diagnostic` 只帶 `stage=robots`、固定 `reason`、已知整數 `http_status` 或 null（未知）。transport 將 timeout、DNS、TLS、connection、HTTP protocol 分開，保留已收到 status，即使 body 後續逾時。401/403 不能被後續 timeout 掩蓋；其他非200不冒拒絕，未知不填零。產品 API 只送固定 detail 與診斷欄位，不序列化原 exception cause／headers／stack；Console 忽略遠端 detail，僅映射固定繁中文案，保留輸入／成果且失效舊確認，無自動重試。

驗證：51 項 Python（scanner/product source/API/service source）、6 項 Console 契約、build／manifest，1280/390/320 瀏覽器及精確 Sites package 路由通過。新增 DNS/TLS/timeout/HTTP拒絕/不可讀/未知、取得403後body逾時、非秘密回應與失敗不存snapshot案例；瀏覽器六類回應為顯式本機 fixture，沒有 public fetch。原安全規則及原 frozen/W1/gate/部署均不改。

真 URL 歷史 attempt1/retry0 保持。本輪無 live 重試：既有記錄不能確證一般暫時錯誤，故條件未成立；不是已證實安全拒絕。新增分類不能回溯舊因，需可靠原路徑原因／恢復證據，或明確涵蓋未知狀態的一次同路診斷讀取授權才接續。未執行真來源→三欄→本頁確認的 local integration，不以本機fixture成功代替。runtime4b3／Sitev11 不含本增量，待原 Reviewer；不部署。

## 2026-10-11 真來源回放完成checkpoint

程式與Console來源：`c7143d6299b3cd0d028a4d820c852d9337bd6b67`，frozen blobs已還原；原Reviewer APPROVE修復，PR/Push CI38139906817／38139903602 SUCCESS且實際logs已核。以下更新先前待審／尚無真來源的歷史紀錄，不改既有程式或Site部署。

原Mac既有Python環境沿同版原scanner於13:07:44.799434–13:07:48.016752 UTC執行一次pipeline：`https://scrapeme.live/robots.txt` 200／316 bytes，規則允許後 `https://scrapeme.live/shop/Bulbasaur/` 200／64,499 bytes；model_calls=0、db_operations=0、call_count=2，沒有換代理或降低DNS/IP/peer/TLS/robots保護。Cloud先前授權重試已在DNS失敗停止（累計attempt2/retry1）；本機回放沒有再次外網抓取。

文字交接sanitized JSON缺原始bytes，原Console先正確拒絕INVALID_SOURCE_BYTES；補傳gzip/base64上游抄漏四個斜線，原Mac對保存原字串作精確diff，在19408字串offset19319/19004/15101/14058由大到小補回後才核完整hash，不猜修。核對結果：

| 證據 | 長度 | SHA-256 |
|---|---:|---|
| sanitized JSON（末尾一LF） | 6,235 bytes | `f57caab1327a7108f1ba3199bbaf50f68171d7492d987ff3a70b4bee353aadcf` |
| Mac pipeline receipt（末尾一LF） | 694 bytes | `db02a03064152dc4e7967e2137a5f2ffb3dc32f7221d8ef3af6fcec448497990` |
| 修復後base64（無末尾LF） | 19,412 ASCII字元 | `8a1bb00bc7bd42cdfe0078fedd5a50dd733ddd889055c791e9dcd77659937f2e` |
| gzip | 14,557 bytes | `09534cc3f7d0d1dbc2f92c575577b501cafceb58e8fb001a941cd010d99d14df` |
| 原始來源bytes／source version | 64,499 bytes | `32da0510b610b592725255a0fe5523f6e64d959b72db50bdb181f64ed1cd761b` |
| Cloud補回兩欄的完整source JSON | 161,394 bytes | `636ceb8216a23acc2f70d6e8ccbd09cda5254170b4e81ff01bae916402808b7d` |
| Cloud accepted-replay-evidence.json | — | `cf9ea7b2fb58dcf3fa307662c9f14c276b8019e998baaf716319ea2e1fa1703a` |

全部匹配後，以base64(raw)和raw.decode(utf8,replace)補snapshot.content_base64/html；原HTML只作資料，未执行。來源snapshot ID=`ba399f02-1a66-49d8-9f6d-d1fd75d5e98a`。同版原Console 1280／390分別攔一次 `/api/product-source` 回完整真來源JSON，其餘外連block：三欄值符合來源extractive_rules、5筆引用可展開；實際module render scope只讀觀測取得revision0／scope=page_only回條，content digest均為 `sha256:e25d34ca7d94e19b22406e5a5058217810f744ed96b2fe024c2ddbd149d7a62a`，另行重算一致。修改標題後revision1／confirmation=null／title_checked=false／確認按鈕停用；page errors=0、成功驗收每viewport回放1次、外連0。最初驗收腳本未展開引用details造成讀取失敗，核明原控制後修正測試操作，沒有改產品或來源。

原Reviewer已自行核三層hash、真來源版本、五引用、1280／390、本頁確認與修改失效，正式 **APPROVE_WITH_DEFERRED_DEBT**。限定真來源離線回放，不是live API接通、Owner事實批准、AI改寫、持久保存或發布；既有debt保留。Vercel部署scope與零新增費用仍未核，Sites Python API未接、登入P2未過；runtime4b3／Sitev11維持，不自啟服務或擴權。

證據位置：原Mac任務的同次本地來源／傳輸暫存，按檔名 `growth-os-public-source-sanitized.json`、`pipeline-receipt-once.json` 及上述hash定位（不公開私人Mac絕對路徑）；Cloud本地 `/tmp/growth-c714-mac-replay/` 下的 `verified-transfer.json`、`source.full.json`、`accepted-replay-evidence.json`、`real-source-replay-{citations,confirmed,invalidated}-{1280,390}.png` 與 `accept.mjs`。此索引保留驗收摘要，暫存檔不保證持久；未將rawHTML/base64或私人logs提交Git。本輪僅更新本README及PROJECT_STATUS，未重跑測試／新抓／DB／模型／部署，PR正文拒絕不重試。
