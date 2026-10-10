# INTRO-TRIAL：固定 R2 proxy／帳本修復候選（未執行 API）

## 2026-10-09 04:25:05 UTC Owner 批准範圍

本包從 `e7808b0f869b187cb9f0ecc16413cac4c63b6516`／`feat/private-host-bootstrap`／Draft PR28 做離線修復，交原 Reviewer。Owner 新批准 **一個 R2 generation**；不是恢復或重送 R1。Primary 不做正式 prepare/live，不讀 key、修改平台 proxy／allowlist／TLS／CA、不建 task／service。下方 R1「不授權第二次」是 03:37 時點歷史；本節是最新範圍，**舊 R1 仍永久 UNKNOWN、US$1 held**，不得改寫、刪除、重設、重新 prepare。

### 固定兩次契約與累計上限

- 原 executor 固定 `01a11e97-7708-75cc-be21-0e58b54c30a9`；父審核後只將 activation 交回此同一 task。程式核 activation、舊 journal 的 execution_task_id；這不是平台 task 身分驗證，父仍須確保沒有其他 executor／副本執行。
- 舊 root `/workspace/intro-trial-state/INTRO-TRIAL-01` 只讀；驗三事件 initialized→reserved→UNKNOWN_STOP、R1 request ID、2026-10-09T03:14:56.418Z reservation、calls1、heldUS$1、source/payload hash 與父提供的 **原始 journal bytes SHA-256**。初始化 R2、執行前及預占前均核對；缺失／漂移／換 task 就停，不自行修復。舊 reservation 數不是上游收件證明，失敗根因仍 UNKNOWN。
- 新固定 root `/workspace/intro-trial-state/INTRO-TRIAL-01-R2`、trial `INTRO-TRIAL-01-R2`、client ID `INTRO-TRIAL-01-R2-1`；沒有 CLI path／attempt override。新 root 不存在只表示 R2 尚未建立，**不表示總帳為零**。新 initialized 及 reserved 均保存舊 reservation 引用；發送前 fsync 新 US$1，累計上限固定 **US$2**。新 UNKNOWN／SIGKILL／部分 journal／crash lock 永久禁止再發，沒有 retry/reset 命令。
- R1 `prepare`／`live` CLI 永久回 `OLD_TRIAL_READBACK_ONLY`。R1 exported fixture helpers 保留供既有離線 regression，正式執行僅使用本節 R2 CLI。
- 仍是既有四欄 public source、固定 `gpt-5.4-mini-2026-03-17`／global `/v1/responses`／standard、完整 JSON ≤4096 UTF-8 bytes（固定 payload 1733 bytes，不是 token 計數）、output1500／無tools／0 count／0 auth probe／0 retry。未稅保守 US$0.30675；Owner 確認台灣5%稅，稅上界 US$0.0153375，合計 US$0.3220875，小於新 all-in US$1，仍全額預占不退額。沒有延長原 **2026-10-09T16:16:40Z**；最後40秒拒絕啟動。
- 候選內容仍用 R1 schema_version2 以相容既有 UI；這是內容格式版本，**不是帳本 attempt**。receipt 的 client fallback 是 R2 ID；新 journal 以 R2 trial 與 artifact hash 綁定。UI、source manifest、frozen artifact、DB/Review/Publish 均不變。

### 單程序既有代理與 fail-closed

[Node 官方企業網路文件](https://nodejs.org/learn/http/enterprise-network-configuration)支持 `node --use-env-proxy` 讓 fetch 使用既有環境代理。R2 CLI 明確要求此啟動 flag，讓 Node 自行使用既有平台 HTTPS proxy／credentials；不設定、印出、解析或替換代理 URL／秘密。guard 只判 effective HTTPS proxy 非空、TLS未停用，並保守拒絕可能讓 api.openai.com 繞過代理的 NO_PROXY 項目；不改寫 NO_PROXY。未知語法亦停，不能刪項通過。為固定啟動方式，非空 NODE_OPTIONS、關閉 proxy 的 flag／env 都停；遇既有設定衝突回報，不自行清除。沒有 direct fallback、redirect、額外 dispatcher 或新依賴。

真 Node24 子程序＋127.0.0.1 fake HTTP target／CONNECT proxy（假 marker）實測：opt-in 的 proxy 收到 marker；無 guard 的 opt-out 確實直連；正式 guard 擋 opt-out／NO_PROXY；proxy 403 不退直連；HTTPS 亦進 proxy，刻意非TLS target 導致 TLS失敗，未安裝CA或停用TLS。所有子程序只帶合成環境，fake proxy 只轉發精確 loopback authority。**這不證明平台 network-secret 替換、真 API 成功或舊失敗根因**，那些本包 NOT_RUN。

### 審核後交原 executor 的非秘密 activation 與命令（本 Primary 未執行）

父在 exact HEAD 的原 Reviewer 通過後填好 `INTRO_TRIAL_R2_ACTIVATION`，不將 key 或 proxy 值放入 activation／repo／命令。`priorJournalSha256` 由原 executor 唯讀原 journal 得到，不能複製或重建舊帳本；reviewedHead 是本包最終40位 HEAD，必須 clean。

```json
{
  "trial": "INTRO-TRIAL-01-R2",
  "ownerApproval": "2026-10-09T04:25:05Z",
  "executionTaskId": "01a11e97-7708-75cc-be21-0e58b54c30a9",
  "soleExecutionTask": true,
  "credentialBindingVerified": true,
  "globalStandardVerified": true,
  "platformProxyAuthorized": true,
  "priorTrial": "INTRO-TRIAL-01-R1",
  "priorHeldNusd": 1000000000,
  "cumulativeCapNusd": 2000000000,
  "taxRatePercent": 5,
  "taxFeeCeilingNusd": 15337500,
  "priorJournalSha256": "PARENT_VERIFIED_64_HEX_RAW_JOURNAL_HASH",
  "reviewedHead": "REVIEWED_40_HEX_HEAD",
  "evidence": "Parent verified same sole executor, original UNKNOWN reservation, existing authorized proxy/credential binding and global standard; Owner confirmed Taiwan 5% tax."
}
```

下列是分開的步驟，不能串接自動重試。先核原帳本及新 root 未用、activation／HEAD／期限；prepare-r2 本身零网络但驗相同 proxy 啟動條件。prepared 成功後由父批准交接的原 executor **只執行 live-r2 一次**，任意失敗只讀回，不重送；不在此 Primary 執行。

```sh
node prototype/intro-trial/runner.mjs readback
node --use-env-proxy prototype/intro-trial/runner.mjs prepare-r2
node --use-env-proxy prototype/intro-trial/runner.mjs live-r2
node prototype/intro-trial/runner.mjs readback-r2
```

58 個本機 tests PASS：40 既有＋16 R2帳本／並行／SIGKILL／授權＋2 真 loopback／guard。原測試一次 fixture typo 已修正，最終全套通過。PLAN/CODE/UNIT/CONTRACT/Node RUN 適用；無獨立build。Browser/DOM、desktop/mobile、DB/Auth、Save/logout/fresh login/readback、tenant 不在本次變更範圍，既有CI全回歸另核；不能把 Preview ready 當 live API 通過。CI新增兩個測試檔到原 step，無服務／dependency。CoreMilestoneProgress=0（必要 Blocking 接線修復，未聲稱新產品成果）；不選開後續工程。exact CI／Preview 回條另附父交審，未自行 APPROVE／activate。

---

## 以下為 03:37:35 UTC 診斷修復歷史（保留原證據）

# INTRO-TRIAL-01-R1：離線診斷修復（唯一實測 UNKNOWN／禁止重送）

## 2026-10-09 最新狀態與本次範圍

Owner 03:37:35UTC批准最小offline診斷修復，起點 `c272bdd9ddd58cf28b017cf6b40bb45bc71f0f07`／原branch／PR28，開始dirty空。父提供唯一API executor `01a11e97-7708-75cc-be21-0e58b54c30a9` 的結果：initialized→reserved→UNKNOWN_STOP；reserved at `2026-10-09T03:14:56.418Z`，檔案mtime `03:14:56.465414Z`，舊UNKNOWN事件没有timestamp。**calls=1是reservation數，不是已證實上游收到一次請求；完整US$1與唯一slot仍held。** 沒有candidate／HTTP status／provider ID／usage／底層exception可讀回。不能由mtime或短耗時重建錯誤、推定已送達，亦不能歸咎credential或proxy；根因仍UNKNOWN。

本Primary本機state／journal／lock不存在，這不撤銷唯一executor的held額度。本包沒有存取或修改executor journal、prepare、live、模型／auth／count／network probe、key／網路／安全配置、付費服務、新task或新dependency。此次**不授權第二次live**。下方10/8的prepare/live命令與activation說明僅為歷史契約，**現在不得執行或重新授權舊slot**；需保留原executor帳本，不能換task歸零。

### 新診斷（只作用於未來另有批准的執行，不修補舊UNKNOWN）

- 原失敗仍丟出STOP、保留預占，不重試不退額；future UNKNOWN_STOP附事件timestamp、固定client correlation `INTRO-TRIAL-01-R1-1`、每次run的隨機operation UUID、allowlisted stage／error type／code、HTTP整數status與安全provider request ID。CLI失敗只輸出安全JSON與runtime capabilities；不輸出error.message／stack／cause物件、raw body、headers、key、placeholder、proxy URL或帶query URL。
- 只接受provider ID格式 `req_`＋32小寫hex，且排除與當次credential／placeholder重疊者；其他格式留null。缺provider ID不以client ID冒充。任意異常型別／code回UnknownError／UNCLASSIFIED；cause最多檢查3層，只取固定enum，不序列化、不觸發getter。HTTP錯誤body不讀入diagnostics。
- dispatch明確區分 `not_invoked`、`invoked_delivery_unknown`、`http_response_observed`。呼叫fetch不證明網路／上游送達；HTTP可能來自proxy，status／request ID也不單獨證明模型成功或計費。
- 階段包含preflight／lock／state_read／payload／reservation／credential／request_build／dispatch／http_status／response_read／response_parse／response_validation／output_parse／output_validation／artifact_write／receipt_write／complete_write／cleanup。尚未dispatch的失敗不寫虛假UNKNOWN送達事件。已預占後任何失敗仍禁止重送。
- diagnostic journal append本身失敗時，CLI仍保留原安全診斷並標記journal_write_failed及allowlisted儲存error code；cleanup失敗不覆蓋原始錯誤。部分／缺失journal仍fail closed，不自動修復。讀stream失敗不被後續cancel錯誤取代。
- 固定model／HEAD binding／4096bytes／expiry／source／單slot全US$1／no retry／no reset、輸出候選與UI保持不變。修復不延長原deadline。

### Runtime／proxy只讀核對

本Primary安全能力快照（不是原executor歷史狀態）：Node `v24.19.0`、Undici `7.29.0`、global fetch可用、`--use-env-proxy`支援=true；可觀察的env/啟動flag proxy opt-in=false，HTTP_PROXY／HTTPS_PROXY／NO_PROXY**名稱存在**=true；explicit dispatcher=false，network_compatibility_verified=false。只記版本及布林，不讀出或記錄代理值；外部preload／平台路由未證實，不能因這些布林斷言走直連或根因。

[Node官方企業網路說明](https://nodejs.org/learn/http/enterprise-network-configuration)支持 `NODE_USE_ENV_PROXY=1` 或 `--use-env-proxy` 讓相應版本的fetch使用配置proxy；[官方fetch文件](https://github.com/nodejs/node/blob/main/doc/api/globals.md#fetch)也支持Undici-compatible dispatcher。**本次未啟用任何一種方式**，沒有改HTTP(S)_PROXY／NO_PROXY／TLS／allowlist或額外依賴，也沒有網路探測。

若後續Owner另批連線修復，最小候選是讓經平台核可的Node啟動方式明確使用既有proxy opt-in，保留目的地限制與TLS驗證，先在隔離local mock核對；此提案未施工，更不構成第二次模型請求授權。不要把普通HTTPS proxy可用直接等同network-secret替換成功。

### 離線驗證及交審

`node --test prototype/intro-trial/intro-trial.test.mjs`：40 PASS（24既有＋16diagnostic），全部synthetic state／stub fetch，零socket。涵蓋thrown secrets、循環cause／getter、HTTP非2xx、JSON解析、output/usage/quote驗證、artifact／journal儲存、cleanup、reservation前失敗、timestamp／correlation、proxy值不外洩與UNKNOWN再進入零send。測試用代理字串只在獨立test process暫存並還原，非環境配置變更。

PLAN/CODE／UNIT／Node RUN適用。Browser/desktop/mobile／DB／Auth／Save／logout／fresh login／tenant不變，本機不重跑；既有CI仍執行全回歸。git diff驗frozen與UI、policy、source manifest零變更。exact CI／Preview另附，交**原Reviewer**；Primary不自行APPROVE／activate。既有失敗根因與真proxy／network-secret相容仍UNKNOWN，本次live NOT_RUN。

---

以下為10/8歷史交付記錄，當時live NOT_RUN；不取代上述10/9唯一實測UNKNOWN及禁止重送狀態。


Owner 2026-10-08T17:47:39Z批准R1；取代913214d上的3count＋3generate契約，不追加另一次批次。原截止 **2026-10-09T16:16:40Z不延長**。本Primary只完成離線工程／CI／Preview，沒有key、正式prepare或live。唯一後續API測試task由父另行安排，不替換Primary，不新增工程task。

## 唯一請求及費用

- 固定 `gpt-5.4-mini-2026-03-17`；全球 `https://api.openai.com/v1/responses`，`service_tier: default`，非regional／FedRAMP／priority。
- 一份既有已核讀public intro與四欄必要引用，只允許 **1次generation、0 count、0 retry**。不抓新URL；無tools、continuation、conversation、background、redirect；output上限1500、reasoning none、store false、truncation disabled。
- 完整serialized JSON UTF-8 **≤4096 bytes**；目前固定payload1733 bytes。這是大小guard，**不是token計數**，已撤除完整input精確≤4000與countusage相等宣稱。
- [官方模型](https://developers.openai.com/api/docs/models/gpt-5.4-mini)400000 context、input US$0.75／output US$4.50每百萬tokens；刻意將整個context全算input再加1500output，保守未稅成本 **US$0.30675**。[官方價格](https://developers.openai.com/api/docs/pricing)Responses無獨立端點費，無工具不產生工具費。啟用前需非秘密證據確認本次適用稅／附加費上界≤US$0.69325及global standard配置；不把未知當零。
- 發送前fsync預占**完整US$1與唯一slot**；成功也不釋放餘額，UNKNOWN／timeout／不完整或不符回條永久停送不退額。回條僅驗input整數1–400000、output0–1500、total一致與model/tier/status/引用，不聲稱事前精確token數。

## 來源與UI相容

`sources.json`僅public-intro：父提供的已授權只讀task最小短引文，頁名、H1、介紹、meta；不包含完整HTML。來源 `https://growthos.genman.work/ai-citation-check`，原頁13131bytes、SHA256 `7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d`。本Primary未重新GET或取得raw HTML。

產物為 `public-intro.candidate.json`，R1使用 `trial: INTRO-TRIAL-01-R1`／schema_version 2。既有preview UI只補回條識別，畫面、引用／差異／理由、套用／編輯／複製與手動稿保護不變。舊schema1仍維持舊4000回條界限，不悄悄放寬；舊artifact可讀不代表舊runner仍獲批准。回條格式不是真實性認證，引用存在不是語義支持，模型品質與搜尋效果仍待核實。frozen商品、Review核心、DB／Save／Publish不動。

## 原task讀回及唯一執行交接

2026-10-08T17:52:41Z原task讀回：起點 `913214d7ccc7ade64713d2c2d1de3a144f730d34`、branch `feat/private-host-bootstrap`，開始時dirty空。`/workspace/intro-trial-state`、原ROOT、created.once、journal.jsonl、run.lock全部不存在；OPENAI_API_KEY名稱不存在，未讀值。新readback命令回 `ABSENT_NOT_AUTHORIZATION`，calls／reserved為null。結合本thread既有零live歷史，沒有已建立的正式slot；**單一空目錄讀回不能證明其他task也未發送**。

正式ROOT刻意仍為 **`/workspace/intro-trial-state/INTRO-TRIAL-01`**，不改成R1新額度目錄。prepare拒絕任何已存在ROOT（包含空／舊版／partial）；run拒絕舊trial、activation或manifest漂移。marker、journal、artifact及目錄fsync；SIGKILL lock不可自動清除。沒有reset／resume-send／journal-path參數。舊版已撤回授權且913214d CLI本來就是closed gate，不能解鎖舊版並行試跑。

跨task沒有共享檔案鎖的保證，不能把本機journal說成跨容器全域鎖。父必須在發放activation前核對**原task零dispatch、舊版不執行、唯一指定API測試task身份、該task未曾prepare或dispatch**，只向該task提供一次交接。其後該task的journal是唯一正式帳本；若task／journal遺失、UNKNOWN或已dispatch，禁止在空的新task重新prepare，回父核對，不能因ABSENT歸零。這是一次既有授權交接，沒有新增registry/service或key搬運。

## 後續測試task啟用前檢核（不需要key值）

1. 原Reviewer已接受exact HEAD，父指定唯一execution task與原deadline。checkout該HEAD並確認工作目錄乾淨；不得改runner或解除guard。
2. 父完成上述跨task狀態核對、確認含稅上界及global standard；readback不含未知／舊slot／lock。不要重播prepare。
3. Owner在Growth-OS環境配置 **Network secret key `OPENAI_API_KEY`**，唯一allowed domain `api.openai.com`，HTTPS443。不得同名再設direct environment variable；不得貼key到對話／檔案／命令或前端。確認有效受限credential與所屬帳戶已有餘額；不使用過期key、不topup、不開auto-reload。
4. [現行Cloud文件](https://learn.chatgpt.com/docs/environments/cloud-environments)：程序獲placeholder，proxy向允許目的地替換真值。runner將placeholder原樣放入Bearer header，不驗sk前綴、不解碼、不輸出；fetch能否實際經proxy由正式環境提供，本包僅離線驗證placeholder傳遞，**未聲稱live相容已測**。Network secret配置／Republish後只由父安排新API測試task；不冒充原task熱繼承。網路policy須允許此HTTPS POST，不能為探測多發模型請求。
5. 提供非秘密環境變數 **`INTRO_TRIAL_R1_ACTIVATION`**（JSON）。它是父核對後的交接回條，不是秘密或自動跨task狀態證明；不可複製給第二個task。prepare將其hash與task ID寫入journal，live必須完全相同。CLI另核本地HEAD等於reviewedHead及工作目錄乾淨。

activation欄位（例中佔位符不能直接用；taxFeeCeilingNusd必須有對應事實證據，單位10^-9美元）：

```json
{
  "trial": "INTRO-TRIAL-01-R1",
  "reviewedHead": "<原Reviewer接受的完整40hex HEAD>",
  "executionTaskId": "<父指定的唯一API測試task ID>",
  "priorStateConfirmedAbsent": true,
  "soleExecutionTask": true,
  "credentialBindingVerified": true,
  "globalStandardVerified": true,
  "taxFeeCeilingNusd": 693250000,
  "evidence": "<父核對舊狀態、唯一task、network-secret metadata、global standard及適用稅費上限的回條引用>"
}
```

`OPENAI_API_KEY`是network-secret placeholder介面；`INTRO_TRIAL_R1_ACTIVATION`是唯一非秘密必要設定。不存在模型／endpoint／重試／費用／journal位置的CLI override。

由repo根執行，**本文件不觸發執行**：

```sh
node prototype/intro-trial/runner.mjs readback
node prototype/intro-trial/runner.mjs prepare
node prototype/intro-trial/runner.mjs readback
node prototype/intro-trial/runner.mjs live
node prototype/intro-trial/runner.mjs readback
```

只有前置核對完整且父指派的唯一task可依序執行prepare/live各一次。prepare無網路；live最多一POST。任何失敗只readback，不修journal、不重發。readback不讀key、不呼叫API、不修改狀態；ABSENT不是執行授權。完整產物／journal均非秘密，應保留供父與Reviewer核對usage／差異／成本，不能拿回條當已改善或已發布。

## 本包驗證

PLAN/CODE是已批准的一次生成契約修訂。UNIT／CONTRACT驗單slot、全US$1预占、零count／retry、bytes、deadline／稅費／綁定／global配置、舊state／manifest／activation拒絕、SIGKILL／並行、回條R1與舊版隔離、proxyplaceholder；固定clock僅供test injection，CLI無override。原生Node／ES modules無build步驟；CLI readback是真唯讀RUN。

```sh
node --test prototype/intro-trial/intro-trial.test.mjs prototype/internal-rc/contract.test.mjs prototype/public-audit/first-result-review.test.mjs prototype/public-audit/first-result-save-intent.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs
```

桌面1280／手機390以R1 synthetic回條實測原候選UI，刻意input_tokens5001證明不殘留R1的4000限制；保留既有產品每尺寸22下載回歸。Parser沒變不重跑獨立Python本機；既有CI仍照常驗。DATABASE／AUTH／SAVE／LOGOUT／FRESH SESSION／LOGIN／TENANT變更N/A；不新增實機操作。正式journal未建立，live **NOT_RUN**；目前無模型品質或實際費用結果。exact CI／Preview回條另交父，Primary交既有Reviewer，不自行APPROVE。
