# INTRO-TRIAL-01-R1：單次生成修訂（live NOT_RUN）

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
