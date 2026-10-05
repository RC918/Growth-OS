# M1 受限模型試驗：固定合成驗收與安全交接

最新狀態：兩個固定合成案例已成功返回並結算，應用台帳合計 US$0.0004708；原截止 2026-10-07T11:50Z 未變。工作台尚未接入，M1仍未全面放行。精確時間與事故／安全交接見「最新遠端狀態與單案例入口」；其餘未部署、staged或停止段落均為當時歷史，不能當成當前runtime狀態。本輪只整理runner、必要離線測試與文件，不執行live runner、不改部署或安全設定。

2026-10-01。產品方向／里程碑仍以 [既有藍圖](../../../docs/AI_Company_Growth_OS_執行藍圖_v1.md) 為準；本文件只記精確技術變更與操作邊界。下列原本機工程批次沒有執行遠端 migration、Edge 部署、金鑰操作、模型 API 或試驗啟用，後續分階段批准與結果保留在時間紀錄。

## 單案例 CLI 的實際安全邊界與離線驗證

`live_single_case.mjs` 是人工授權後才能使用的隔離試驗工具，不是 CI／背景工作。它會寄出一次既有 owner 登入郵件、驗證登入與工作區，再等待 stdin 的明確 fixture dispatch；每次程序最多發送一次模型 POST，沒有自動 retry、token refresh、fallback 或 ledger reset。只有重新執行程序仍可能產生新的 request_id，故沒有「永遠最多一次」或跨程序去重保證；任何未知結果須先核對原 request 的持久 ledger，不能因本地失敗再執行。

runner 不直接執行 SQL／保存業務資料，但呼叫的 Edge endpoint **會預留／結算或暫停持久 ledger**。已知用量由伺服器結算並釋放差額，未知用量保留預留額；runner只記錄返回結果，不能退還、重置或自行確認帳務。`completed=true` 只表示 HTTP200及synthetic_trial／can_persist旗標符合，不獨立證明完整推論契約、usage數字、DB結算、價格或provider invoice。`model_posts` 在持久保存發送意圖前設定，代表嘗試發送的意圖，不是provider已收到／已計費的證據；真正接受與結算須依原request讀回。金額是既定價格計算與應用ledger值，四捨五入平台$0.00不能當免費或精確invoice。兩個已完成case以各自HTTP／DB／業務雜湊證據為準，不依單一CLI旗標宣稱M1通過。

CLI本身**不關閉 terminal echo，也不偵測 raw mode**。操作端須在提供登入資料前安排不回顯的raw stdin；不能直接在一般canonical TTY貼完整郵件。只提供一個縮短的登入anchor，禁止透過命令列、env檔或檔案傳憑證。CLI不有意保存登入link／JWT到證據檔，成功輸出只包含固定合成proposal及帳務；但stdin工具轉錄、終端錄製、shell／平台診斷各有持久記錄風險，不能宣稱整個操作鏈「memory-only／從不記錄」。不錄製、不snapshot／attach尚未證明安全的key顯示頁、不讀clipboard；本人處理key建立／替換及關閉顯示／輸入視窗，agent只讀安全metadata，不能用CLI不輸出key作為UI安全保證。

登入redirect只走HTTPS、禁止URL內帳密或自訂port，限制既定tracking host／isolated Auth verify／callback。最多五個跳轉是同一次登入link的redirect鏈，並非失敗後retry；鏈耗盡、EOF、權限拒絕或異常即停止。owner結果須符合指定actor與org。已有證據檔以wx拒絕，不覆寫；新檔會在POST前記錄意圖，之後僅保存安全狀態，不以本地中斷推論遠端取消。

離線測試：`node --test supabase/tests/model_trial/live_single_case.test.mjs`。子程序在載入真實CLI之前以固定fake fetch取代所有HTTP，使用合成mail/JWT標記及固定clock，不帶入父程序credentials；没有真實Auth／provider／Supabase／browser／ledger或部署。九項測試涵蓋兩fixture單次發送、既有檔不變、cutoff、EOF／非HTTPS鏈、owner拒絕／org錯配、dispatch不符、模型403／timeout不retry、unknown保留回傳held、可persist回應不標completed，以及合成憑證標記不進stdout/stderr/證據。這證明CLI控制流，不證明terminal echo關閉、伺服器SQL效果或provider帳單；伺服器unknown pause與原子ledger另由既有handler／ledger／integration測試驗證。CI只執行此離線test，不執行live_single_case.mjs的真實入口。

## 已批准範圍與本批狀態

本人 2026-10-01 16:32 台北批准：GPT-4.1 mini、既有隔離 Supabase `vhzryhibmpvglzcmfnaa`、合成資料、7 天、最多 100 呼叫、模型費 US$1。不含充值、訂閱、付費升級、正式資源或新安全權限；額度不足即停止。這份批准不等於下列 SQL／ACL／runtime 已獲准上線。

本機已實作 handler、固定合成資料 provider adapter、原子持久 ledger、分離啟用／停止／清理草案。工作台未接入，推論輸出仍需本人確認，`can_persist=false`；沒有呼叫原保存 RPC。M1 真實自然語言、修正確認 UI／目標使用者及 M2 驗收仍待完成。原 JWT／probe PASS 沿用，不重跑。

## 固定限額與資料邊界

- 固定 `gpt-4.1-mini-2025-04-14`；生成後 provider input usage ≤2048、output usage ≤1024；2048不是事前保證，輸出請求 max_output_tokens=1024；default tier、store=false、無 tools/files/batch/background、無自動重試／fallback。模型收到的只有兩份伺服器固定合成材料及來源版本；不收任意 browser prompt，不傳 user/org/goal ID、JWT、私有工作區或金鑰。
- 在唯一生成呼叫前，單一 SQL row 的 FOR UPDATE 原子保留 2 個外部 HTTP slots 與 US$0.4206688。每次僅生成一次，但仍保留2個slots、不回收多保留的slot，因此最多50次生成且不提高原100上限；中止不退回 slots。全域最多 1 個未完成 request，所有 instances 共用同一 ledger，request_id 重送不再 dispatch。
- 預留額不是 2048-token 估計：採完整模型 context 1,047,576 輸入＋1024 輸出的保守界限；整數 nanoUSD，input 每 token 400、output 1600。已花＋保留 ≤1,000,000,000 nanoUSD。只在精確 pinned model/default tier/完整整數usage及事後input/output界限均符合時結算並釋放差額；未知用量、逾時、生成後input/output超界都保留全額並 pause。停用、失敗或重送不重置預算。
- 持久 50%／80% 提醒包含 slots／已花＋保留，API 回傳 metadata；工作台提醒 UI 尚未接入，不發郵件、不購買提醒服務。
- staged 的 starts_at/deadline 都 NULL。只有明確 ready 操作才開始 7 天；等金鑰不計時。到期前 2 分鐘停止新 reserve，每次外呼前再次檢查剩餘 1 分鐘與 current owner；provider timeout 40 秒。停止不取消已發出的請求，須保留／核對其帳務，不能據本機測試保證 provider 帳單。

價目與context依據 [OpenAI模型頁](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。主管已批准本機保守修訂：完全移除外部計數端點及其免費旗標，不用本地字數／bytes估算token。2048改為生成後完整usage的驗收；超界已發生費用不能撤銷，保留context最壞費用並pause，不回proposal／不重試。固定模型、default tier、output1024及现行價格須部署前核對，USD1只涵蓋模型API費，不是稅／匯差／其他平台費的授權。ID-only HTTP envelope有bytes大小檢查，僅限制請求結構，不宣稱限制模型input tokens。七天／100slots／USD1／單併發及無業務寫入均不放寬。新ready政策 `gpt41mini-20250414-v2-postusage`，舊v1旗標不能啟用新版。

## 尚需單項批准的精確遠端安全變更

1. SQL：完整 `supabase/migrations/20261001083611_growth_model_trial_budget.sql`。新增 private.model_trial／model_trial_attempts，兩表 RLS、無 client／service_role 表權；migration 只插 staged row。無既有資料／角色／RLS／default privilege 修改。
2. RPC：新增 public.model_trial_reserve(uuid,uuid,uuid,text,text,integer)、model_trial_authorize_dispatch(uuid,uuid,uuid)、model_trial_settle(uuid,integer,integer,text) 及 private.has_org_role_for_model_trial(uuid,uuid)。均 SECURITY DEFINER、空 search_path，以管理者擁有；三個 public RPC 撤 PUBLIC/anon/authenticated EXECUTE，只授既有 service_role；private helper 無 client EXECUTE。管理者definer／共享service_role新增能力必須明確批准。共享service_role可提交任意既有reservation的結算數字，SQL只核對狀態／界限／原子性，不能獨立證明provider usage或提交者是本handler；受信任邊界包括所有持有此backend key的程式，不能稱handler專屬權限。reserve／dispatch核對指定actor/org與當前owner；settle不重新用JWT授權，也不允許寫goal/history/audit或business表。user JWT不能直接執行ledger，service_role不交前端或模型。
3. Runtime：只在此隔離專案部署 `growth-model-trial`，入口與全部 imports 見 supabase/functions，config.toml 保留 verify_jwt=true；不使用 no-verify-jwt。每次以 caller bearer 驗證 Auth user、user-scoped owner membership；dispatch 再由 SQL 檢查 owner；回應前再次核對身份／來源版本。禁止任何 CI 自動部署此 Edge／migration／secrets。本批新增真正Supabase Edge Runtime user-worker載入與gateclosed503的CI測試，見下；這不是已部署平台gateway／JWT驗證或live Auth／模型驗收。verify_jwt/custom entrypoint 依 [官方配置](https://supabase.com/docs/guides/functions/function-configuration)。新預覽只部署原靜態 apps/web。
4. 帳戶／交接：確認既有免費平台額度、模型可用性、現行價目後，本人只在 [隔離專案 Dashboard](https://supabase.com/dashboard/project/vhzryhibmpvglzcmfnaa/functions) 的 Secrets 介面設定 OPENAI_API_KEY；不貼聊天、不錄影／截圖含值、不以 agent CLI／工具讀回或傳遞值。若需要購買 credit／升級則停止，原批准不授權。Agent 不建立、代填、讀取、保存或轉送金鑰。部署時使用平台內建 SUPABASE_ANON_KEY／SUPABASE_SERVICE_ROLE_KEY，由程式 runtime 讀取；本輪工具不讀值。
5. Ready：先完成上列證據、quota與部署審查；未設定新版 `MODEL_TRIAL_READY_POLICY` 時始終拒絕；外部計數與免費旗標均已刪除。明確核准 actor/org 的非秘密 UUID 後核对 activate.sql.template 的替換結果，執行才開始 7 天；精確 start/deadline 由 DB 讀回。不得現在代填／執行模板、不猜帳戶 IDs、不提前設 flags／啟用。資料只限靜態合成 fixture，不自動接真實客戶。

## 停止、清理與證據

首先撤除 runtime ready flag，執行 stop.sql 只關閉 admission、不退還／重設帳務。active/unknown usage 保留 ledger，核對 provider 帳務前不得 resume 或刪除；沒有自動 resume RPC。不為了讓測試成功重置原台帳。

確認無 active request、held=0、attempts 都 settled 且狀態 staged/closed，另核准 cleanup.sql 才以無 CASCADE 的精確 DROP 移除本次 4 functions／2 tables；任一依賴／前置不符就整筆回退。再停用／移除僅此 Edge Function 與本次專用 readiness flags／OPENAI_API_KEY，由本人操作含 secret 的刪除介面；不動既有平台內建 secrets、Auth、org、goal、history、audit、其他功能或正式專案。七日到期即停止外呼；應用不落地原始 prompt/response，已知帳務結算後清除本次試驗 metadata，未知帳務保留至對帳，不宣稱已完成清除。程式庫內的固定合成測試樣本是測試 fixture，不是真實客戶材料。

離線證據：handler 13 tests、PGlite SQL 13 groups、handler→SQL integration 2 groups、所有 migrations 編譯／既有 goal SQL 9 groups。Auth/provider 是 doubles，PGlite PG18.3 不代表 native concurrency。CI 新增 postgres:17.6 一次性容器測試：network=none、Unix socket、無 TCP／密碼／cloud，A/B/C 真實獨立 PID、B Lock blocker=A、僅一筆預留成功、失敗交易整笔回退；本機 Docker daemon 不運行，結果以該 head CI 實際輸出為準。部署／live模型費／UI／真實Auth未驗收，M1不放行。

### 真正Edge Runtime離線驗證範圍

`edge_runtime.py`／`edge_harness/index.ts`以官方 [self-host compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) 的固定 `supabase/edge-runtime:v1.76.2`啟動main dispatcher，再由 `EdgeRuntime.userWorkers.create`載入真正production index.js及所有相對imports／Web Crypto。worker envVars=[]、無provider key、無平台secrets、network=none／無host ports。只把明列7份程式複製至臨時目錄唯讀掛載，不掛checkout／home／env檔／Docker socket。HTTP在容器內loopback呼叫，gate未啟用必須503 TRIAL_NOT_READY與no-store、GET405；boot/import錯誤只能500 EDGE_BOOT_FAILED，不會假算503成功。測後移除容器與臨時程式。CI記錄image digest与複製程式hash；本機Docker未運行，不以Python／Deno語法冒充runtime成功。

這證明固定自架runtime的user-worker實際module graph載入及關閉gate路徑；沒有測Supabase雲端deploy/eszip流程、verify_jwt gateway、ready真實Auth或provider，也不等於這些已部署驗收。本輪成功與限制以同headCI／outputs為準，不重試跨聊天回報。

首次真正runtime載入因node:crypto的graph解析試圖下載@types/node而被無網路阻擋，結果500 EDGE_BOOT_FAILED，未算成功。修正使用runtime內建標準Web Crypto SHA-256；既有驗證邏輯抽成單一goal-inference-core，原同步Node契約仍為薄adapter、確認hash／API不變，新增parity測試。沒有自製hash演算法、無新增npm runtime依賴、不允許runtime外網。image固定為實測digest，早期失敗保留。
## 2026-10-01 19:24 台北：已批准部署完成，gate仍關閉

本人2026-10-01 10:59UTC精確批准；11:20UTC完成Dashboard登入。CLI名稱查核失敗的先前阻礙紀錄保留，不改寫為當時成功。其後Codex In-app Browser 2／tab1在指定專案functions/secrets顯示「No custom secrets created」，部署前後均無OPENAI_API_KEY、MODEL_TRIAL_READY_POLICY或任何custom ready設定；未展開值。確認無部分既有物件後，只原樣套用c0c146a migration（SHA256 9d14a0e21db8cea3398d439b8dd40a973c8b75e063a89f6a69d07fde31be3939），deploy growth-model-trial v1／verify_jwt=true，讀回7份production來源逐字相同。未改原來源、既有role/default privileges或共享service_role信任邊界。

独立connector讀回：兩private表RLS=true，anon/authenticated/service_role無直接SELECT；4函式postgres owner、SECURITY DEFINER、empty search_path，PUBLIC／anon／authenticated無EXECUTE，3public RPC僅既有service_role另有EXECUTE，private helper亦拒service_role。20張public業務表筆數及SHA256全相同；growth_goal_turns仍13。trial staged、starts_at/deadline/actor/org/active_request=NULL、calls/spent/held/attempts全0。未呼叫function／provider，因此本輪無模型請求；短窗口function logs聚合無資料，但log延遲／來源覆蓋不能作獨立provider帳單證明。未查billing或承諾平台零費用。

[Supabase Advisor RLS無policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)對應本設計兩私有ledger表的拒絕直連，不新增client policy。另回報[Auth leaked-password protection disabled WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)，本批未改Auth／方案／付費，保留原警告。這些結果不等於live Auth、gateway、provider或工作台驗收。完整證據在聊天outputs/Growth-OS-model-trial-deployed-gateclosed-c0c146a.json；前節未部署狀態保留為歷史。

### 本人專用key交接：只設定key，不啟用試驗

1. 本人在OpenAI API Platform核對既有可用credit／quota與固定模型gpt-4.1-mini-2025-04-14可用性；額度不足、不可用或需要充值／升級立即停止，只回報狀態，不新增付費。本輪agent未驗證帳戶credit，不把ChatGPT訂閱當API額度。
2. 使用僅供Growth OS合成試驗的獨立OpenAI project。本人在該project的API Keys建立**user-owned**專用key（勿使用共享或Default project key），選Restricted，僅Responses／生成Responses對應Write權限，所有其他資源設None；若當前UI不能表達此最小權限，停止回報，不自行改All。名稱可用growth-os-synthetic-trial。agent不開啟key建立／顯示介面、不生成或代填。
3. 本人直接在[指定Supabase Secrets](https://supabase.com/dashboard/project/vhzryhibmpvglzcmfnaa/functions/secrets)新增名稱OPENAI_API_KEY，值由本人從OpenAI一次顯示直接輸入並保存；不得貼聊天、檔案、CLI、日誌、錄影或含值截圖。若同名已存在，停止，不覆蓋。不要新增MODEL_TRIAL_READY_POLICY或其他ready旗標；不執行activate模板。完成僅回報「key已設定」及credit／固定模型是否可用，不回報值。
4. agent下一輪僅查名稱存在性與ledger仍staged／時間NULL；key存在不代表權限／額度／live API通過。明確ready actor/org、七天啟用及live驗收是後續獨立步驟，本次交接不自動啟用。

[OpenAI key權限文件](https://help.openai.com/en/articles/8867743-assign-api-key-permissions)說明Restricted是逐資源設定，service-account建立對話不提供同樣控制。[最新spend-limits文件](https://developers.openai.com/api/docs/guides/spend-limits)區分alert與hard-limit enforcement且後者有傳播延遲，不能將警示預算當精確即時硬上限；本次不改OpenAI帳戶limits、不提高額度。應用保留已批准的原子ledger上限，平台帳務仍需真人核對。保留ledger，不执行DROP／reset／refund。

## 2026-10-01 最新遠端狀態與單案例入口

### 兩固定案例的驗收與先前停止紀錄

2026-10-01 15:04UTC 最新合成驗收：本人直接確認替換／權限完成／ready恢復並僅批准續跑第二fixture後，完成必要的一次fresh owner Auth與RLS owner核對，僅發送 `synth-shop-v1` 一次；未重跑第一case、未retry/reset/refund。第二request `ec4183e8-6bba-4f49-b7fa-8afee43af2e8` HTTP200／settled／result_code=ok，input226/output89，232800nUSD=US$0.0002328。第一case仍僅1attempt，兩case合計470800nUSD=US$0.0004708、held0、active_request=NULL、unsettled0、calls_reserved4（四個預算槽、兩次generation）；US$1 cap剩餘US$0.9995292。T0=2026-10-01T12:36:50.150072Z、T1=2026-10-07T11:50Z不變。20張業務表計數／SHA256未變，原13筆歷史保留。回應均 synthetic_trial／can_persist=false／awaiting_user_confirmation／inference_verified=false，沒有發布或寫入業務草稿。

兩固定case的 live Auth／model／契約與應用台帳驗收通過，不代表產品UI／M1全面通過。官方專用project用量頁本輪安全唯讀仍顯示1request／input227／$0.00，尚未反映第二case；金額以上均為既定價格計算與應用ledger，非invoice，不將四捨五入顯示當0。沒有自動輪詢或第三case。agent未讀新key值／開credential modal／改secret或gate／部署；ready恢復與權限完成為本人直接回報。證據：outputs/Growth-OS-live-model-authorized-case2-20261001.json、outputs/Growth-OS-two-fixed-cases-acceptance-20261001.json。下列停止與metadata狀態保留為歷史。

2026-10-01 14:32UTC 安全 metadata 後續核對：本人替換並關閉視窗的回報後，既有 OpenAI handle 限定確認 key display heading=0／dialog=0，只讀目前欄位名稱與 Name/Status/到期日/Permissions。`Growth OS Trial replacement` 為 Active／Restricted，舊 `Growth OS Trial` Revoked；新 key 到期日顯示2026年10月8日，exact UTC未在清單顯示，不能確認不晚於原2026-10-07T11:50Z，故仍禁止恢復。Restricted亦不能推論逐資源 Responses Write only／其餘None。Supabase只讀名稱／更新時間，OPENAI_API_KEY更新14:28:52Z；非秘密 MODEL_TRIAL_READY_POLICY更新14:25:22Z，摘要等於SHA256(paused)，確認設定paused，未外呼驗證runtime。DB仍active、1settled／0unsettled／noactive／held0／spent238000nUSD／calls2，原T0/T1未变。模型／登入／key／secret／gate／DB皆無新增或寫入。本批證據 outputs/Growth-OS-replacement-key-paused-metadata-20261001.json 列出最小恢復前置，第二fixture synth-shop-v1仍待另行明確恢復指示，第一case不重跑；以下前節metadata保留為歷史。

2026-10-01 14:19UTC 唯讀事故跟進：先檢查既有安全 handle 的頁面位置與 key modal/dialog 均不存在，再只讀 API keys 清單 Name/Status，專用 Growth OS Trial 唯一列已為 Revoked；沒有讀 Secret Key/Tracking ID。官方用量已到達：指定模型1 request、input227/output92（total319），與應用台帳一致；官方費用畫面只顯示四捨五入 $0.00，精確 provider 帳務仍未驗證。DB仍active，attempts1／unsettled0／active_request=NULL／held0／spent238000nUSD／calls_reserved2，原T0/T1未變。沒有新 key／登入／模型／DB／secret／gate 操作。runtime gate 本輪未重新核對，最後已知 policy 存在，不能宣稱runtime已關閉。安全替換流程只備妥於聊天outputs/Growth-OS-safe-key-replacement-handoff-20261001.md；事故去秘密metadata與最新讀回在outputs/Growth-OS-key-revoked-readonly-followup-20261001.json。第二案例仍未發送，不自動恢復；下列未撤銷／No data 狀態保留為歷史。

本人在本聊天直接批准重新取得一次 owner 登入郵件後，已完成 fresh real Auth／RLS owner 核對，且只發送一次 `synth-parts-v1`。request `0be53526-f521-42b1-b434-60781678b198` 在 2026-10-01T14:09:39.446356Z settled，HTTP 200、result_code=ok、input=227／output=92 tokens。actual_nusd=227×400+92×1600=238000，即應用台帳 US$0.000238；held=0、active_request=NULL。calls_reserved=2 是既定的兩個預算槽，只對應一個模型 generation／一筆 attempt。草稿 awaiting_user_confirmation、inference_verified=false、can_persist=false，沒有發布或保存為業務資料；20 張業務表計數／SHA256與既有基準相同，原目標仍13筆歷史。US$1 cap、原 starts_at／2026-10-07T11:50Z deadline 均未變，沒有 retry/refund/reset。

第二案例未發送，停止原因有兩項：OpenAI Growth OS Trial 用量頁仍顯示 No data／0 requests／0 tokens，尚不能核對 provider 帳務，畫面 $0.00 不代表此請求免費；此外，既有 OpenAI user tab 停留在一次性 key 顯示 modal，瀏覽器初始 accessibility 輸出包含憑證欄位。agent 已關閉 modal，沒有複製、代填、保存至專案檔案或使用該值；工具轉錄暴露需由本人撤銷並替換此專用 key，agent 不操作 credential 建立／撤銷／旋轉。此事件與帳務未確認均禁止第二案例；不得將應用台帳驗收寫成 provider 帳務／M1 全面通過。

證據：聊天 outputs/Growth-OS-live-model-authorized-case1-20261001.json、outputs/Growth-OS-model-case1-accounting-second-stopped-20261001.json。以下先前阻塞狀態為當時歷史，沒有刪除或覆寫。

期限修訂已由本聊天本人直接批准並套用，DB 試驗於 2026-10-01T12:36:50.150072Z 啟用，固定截止 2026-10-07T11:50:00Z；沒有延展或重置。2026-10-01T14:00:43Z 讀回 active、calls_reserved=0、spent_nusd=0、held_nusd=0、attempts=0、active_request=NULL，原目標歷史仍 13 筆。Dashboard 的 MODEL_TRIAL_READY_POLICY 名稱存在，updated_at=13:39:32Z，摘要符合 gpt41mini-20250414-v2-postusage；這只證明設定摘要，不等於模型或帳務驗收。

新增 `live_single_case.mjs` 是獨立 CLI 驗收入口，未接入產品介面，也不改部署：固定 isolated origin/actor/org/fixture/cutoff，先驗 owner，再等待明確 stdin dispatch 指令。每個程序最多一個模型 POST，無 refresh/retry、無直接 SQL 或 business mutation；Endpoint會改預留／結算ledger。輸出檔必須新建，發送前保存意圖，未知結果不得再次呼叫。登入資料與不回顯由操作端安全管理，不能宣稱工具轉錄也只存在記憶體；具體限制與離線測試以本文件「單案例CLI的實際安全邊界」為準。

本人批准兩個固定合成案例、總費用 US$1，但第一案例尚未發送：本地輸入通道失敗後，automatic approval review 拒絕再次登入，理由為未有新的直接授權而構成自動重試。已停止並保留所有先前證據；目前只有語法檢查通過，live 模型／用量／provider 帳務未驗收。不得以此紀錄宣稱 M1 通過。後續須先取得接續登入的直接授權；第一案例完成後獨立讀回該 request 的 input/output tokens、result_code、actual_nusd 與總 ledger，再核對 provider 帳務，才能發送第二案例；未知用量、逾時或權限拒絕即停止且保留預留額。不得 reset/refund/retry。

證據：聊天 outputs/Growth-OS-deadline-applied-db-active-runtime-closed-20261001.json（DB 啟用當時），outputs/Growth-OS-model-live-approval-blocked-20261001.json（本輪最新）；以下「尚未套用」段落保留為當時歷史。

## 2026-10-01 最多七天期限修復：當時本機工程，現已套用遠端

本人試驗批准是最多七天。現有遠端model_trial_check1強制等於七天，且SQL CHECK UNKNOWN可能接受非法NULL截止；不要求延長或重建本人七天key。新增CLI生成migration `20261001120704_growth_model_trial_bounded_deadline.sql`，保留已套用的原migration不改。新migration先精確核對現有constraint名稱／validated／定義，漂移即整筆拒絕；僅替換這個CHECK。staged必須兩時間NULL；active/paused/closed必須兩時間非NULL、deadline>starts_at且<=starts_at+7days、actor/org非NULL。沒有DML、新角色、RPC、RLS／ACL／owner／defaultprivilege／預算／provider／runtime／business變更。

activate模板仍在singleton FOR UPDATE取得鎖後取clock_timestamp為T0，T1=least(T0+7days,2026-10-07T11:50:00Z)。C由本人／父提供為保守key cap，不將secret updated_at或回覆時間當key到期。剩餘時間必須**超過三分鐘**：既有reserve提前2min拒絕＋1min準備緩衝，dispatch仍提前1min拒絕，provider timeout40sec不變。C截止時reserve自10/7 11:48UTC拒絕，dispatch自11:49UTC拒絕。人工安排stop只在實際執行時closed，不是DB硬截止；已dispatch請求仍需結算，無refund／reset／cleanup。

新增deadline_engine在完整20張synthetic業務表的PGlite驗短期／exact7days、NULL／零負／>7days與狀態／actor/org拒絕、到期／<=3min啟用拒絕、原constraint漂移拒絕、repeat啟用不刷新，以及全部業務雜湊、計數、RPC定義／ACL、RLS、role/defaults/policy未變。native_ledger沿用官方PG17.6隔離容器（network none／Unix socket／no TCP／no cloud），載入完整migration歷史，新增A/B/C不同PID真實readiness Lock/blocker、已啟用再試拒絕与同一批不變性。CI實際結果看本次同head證據，不以PGlite或Python語法宣稱native成功。所有offline harness只替換**記憶體內**啟用SQL的C為合成短期clock，避免10/7後CI失效；production template的固定C不變，測試不會啟用遠端。

本輪只工程／正常分支推送與CI／草稿PR；遠端仍原CHECK與staged，不套用新migration、未設定ready／啟用、無模型／key／瀏覽器／付費操作，不重跑遠端probe／JWT。後續先審核精確migration與SHA256並套用後独立constraint／security／business／ledger讀回；再明確啟用交易读回T0/T1<=C，最後本人設定非secret `MODEL_TRIAL_READY_POLICY=gpt41mini-20250414-v2-postusage`。T0不可預猜或回填，不延展既有啟用。
