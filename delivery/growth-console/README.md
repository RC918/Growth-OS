# Growth OS Console 增量原型／URL 接線

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
