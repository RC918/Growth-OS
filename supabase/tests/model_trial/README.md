# M1 受限模型試驗：已部署、gate關閉與安全交接

目前部署狀態與本人key交接見文末19:24節；下方本機工程／未批准段落保留為歷史，不代表目前尚未部署。七天未開始，M1仍未全面放行。

2026-10-01。產品方向／里程碑仍以 [既有藍圖](../../../docs/AI_Company_Growth_OS_執行藍圖_v1.md) 為準；本文件只記精確技術變更與操作邊界。本批沒有執行遠端 migration、Edge 部署、金鑰操作、模型 API 或試驗啟用。

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
