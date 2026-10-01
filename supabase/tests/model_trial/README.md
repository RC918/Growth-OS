# M1 受限模型試驗：本機工程與單項安全審查包

2026-10-01。產品方向／里程碑仍以 [既有藍圖](../../../docs/AI_Company_Growth_OS_執行藍圖_v1.md) 為準；本文件只記精確技術變更與操作邊界。本批沒有執行遠端 migration、Edge 部署、金鑰操作、模型 API 或試驗啟用。

## 已批准範圍與本批狀態

本人 2026-10-01 16:32 台北批准：GPT-4.1 mini、既有隔離 Supabase `vhzryhibmpvglzcmfnaa`、合成資料、7 天、最多 100 呼叫、模型費 US$1。不含充值、訂閱、付費升級、正式資源或新安全權限；額度不足即停止。這份批准不等於下列 SQL／ACL／runtime 已獲准上線。

本機已實作 handler、固定合成資料 provider adapter、原子持久 ledger、分離啟用／停止／清理草案。工作台未接入，推論輸出仍需本人確認，`can_persist=false`；沒有呼叫原保存 RPC。M1 真實自然語言、修正確認 UI／目標使用者及 M2 驗收仍待完成。原 JWT／probe PASS 沿用，不重跑。

## 固定限額與資料邊界

- 固定 `gpt-4.1-mini-2025-04-14`；完整指令＋輸入＋schema 計數 ≤2048、輸出 ≤1024；default tier、store=false、無 tools/files/batch/background、無自動重試／fallback。模型收到的只有兩份伺服器固定合成材料及來源版本；不收任意 browser prompt，不傳 user/org/goal ID、JWT、私有工作區或金鑰。
- 在任何計數／生成呼叫前，單一 SQL row 的 FOR UPDATE 原子保留 2 個外部 HTTP slots 與 US$0.4206688。計數也計入 100 呼叫，因此最多 50 組計數＋生成；中止不退回 slots。全域最多 1 個未完成 request，所有 instances 共用同一 ledger，request_id 重送不再 dispatch。
- 預留額不是 2048-token 估計：採完整模型 context 1,047,576 輸入＋1024 輸出的保守界限；整數 nanoUSD，input 每 token 400、output 1600。已花＋保留 ≤1,000,000,000 nanoUSD。只在精確 pinned model/default tier/usage/token count 均符合時結算並釋放差額；未知用量、逾時、計數超界都保留全額並 pause。停用、失敗或重送不重置預算。
- 持久 50%／80% 提醒包含 slots／已花＋保留，API 回傳 metadata；工作台提醒 UI 尚未接入，不發郵件、不購買提醒服務。
- staged 的 starts_at/deadline 都 NULL。只有明確 ready 操作才開始 7 天；等金鑰不計時。到期前 2 分鐘停止新 reserve，每次外呼前再次檢查剩餘 1 分鐘與 current owner；provider timeout 40 秒。停止不取消已發出的請求，須保留／核對其帳務，不能據本機測試保證 provider 帳單。

價目／context 與計數介面依据 [OpenAI 模型頁](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[完整輸入計數說明](https://developers.openai.com/api/docs/guides/token-counting)。目前沒有找到計數端點「不另收費」的官方證據，因此 `MODEL_TRIAL_COUNTING_NO_ADDITIONAL_CHARGE` 未設定，整條 runtime 預設拒絕，不能聲稱已具完整 live US$1 成本保證。

**計費阻礙的最小可選替代，尚未採用：**移除外部計數呼叫，保留完整 context 最壞費用預留，改用已驗證涵蓋指令、輸入及 schema 的本地 tokenizer／可證上界，維持 2048 gate；取得這套界限與政策審查證據後才另改。單靠字數估算或預留整個 context 不能證明輸入 ≤2048，不能默默放寬 gate。另一選項是取得現行計數計費的權威證據後沿用現設計。

## 尚需單項批准的精確遠端安全變更

1. SQL：完整 `supabase/migrations/20261001083611_growth_model_trial_budget.sql`。新增 private.model_trial／model_trial_attempts，兩表 RLS、無 client／service_role 表權；migration 只插 staged row。無既有資料／角色／RLS／default privilege 修改。
2. RPC：新增 public.model_trial_reserve(uuid,uuid,uuid,text,text,integer)、model_trial_authorize_dispatch(uuid,uuid,uuid)、model_trial_settle(uuid,integer,integer,text) 及 private.has_org_role_for_model_trial(uuid,uuid)。均 SECURITY DEFINER、空 search_path，以管理者擁有；三個 public RPC 撤 PUBLIC/anon/authenticated EXECUTE，只授既有 service_role；private helper 無 client EXECUTE。管理者 definer／共享 service_role 的新增能力必須明確批准；user JWT 不能直接執行 ledger，service_role 不交前端或模型。
3. Runtime：只在此隔離專案部署 `growth-model-trial`，入口與全部 imports 見 supabase/functions，config.toml 保留 verify_jwt=true；不使用 no-verify-jwt。每次以 caller bearer 驗證 Auth user、user-scoped owner membership；dispatch 再由 SQL 檢查 owner；回應前再次核對身份／來源版本。禁止任何 CI 自動部署此 Edge／migration／secrets。本批只有 Node 語法／handler 測試，尚未通過 Supabase Edge 打包及 live Auth 測試。verify_jwt/custom entrypoint 依 [官方配置](https://supabase.com/docs/guides/functions/function-configuration)。新預覽只部署原靜態 apps/web。
4. 帳戶／交接：確認既有免費平台額度、模型可用性、現行價目及計數費用後，本人只在 [隔離專案 Dashboard](https://supabase.com/dashboard/project/vhzryhibmpvglzcmfnaa/functions) 的 Secrets 介面設定 OPENAI_API_KEY；不貼聊天、不錄影／截圖含值、不以 agent CLI／工具讀回或傳遞值。若需要購買 credit／升級則停止，原批准不授權。Agent 不建立、代填、讀取、保存或轉送金鑰。部署時使用平台內建 SUPABASE_ANON_KEY／SUPABASE_SERVICE_ROLE_KEY，由程式 runtime 讀取；本輪工具不讀值。
5. Ready：先完成上列證據、quota與部署審查；未設定 `MODEL_TRIAL_READY_POLICY` 與計數 confirmed 旗標時始終拒絕。明確核准 actor/org 的非秘密 UUID 後核对 activate.sql.template 的替換結果，執行才開始 7 天；精確 start/deadline 由 DB 讀回。不得現在代填／執行模板、不猜帳戶 IDs、不提前設 flags／啟用。資料只限靜態合成 fixture，不自動接真實客戶。

## 停止、清理與證據

首先撤除 runtime ready flag，執行 stop.sql 只關閉 admission、不退還／重設帳務。active/unknown usage 保留 ledger，核對 provider 帳務前不得 resume 或刪除；沒有自動 resume RPC。不為了讓測試成功重置原台帳。

確認無 active request、held=0、attempts 都 settled 且狀態 staged/closed，另核准 cleanup.sql 才以無 CASCADE 的精確 DROP 移除本次 4 functions／2 tables；任一依賴／前置不符就整筆回退。再停用／移除僅此 Edge Function 與本次專用 readiness flags／OPENAI_API_KEY，由本人操作含 secret 的刪除介面；不動既有平台內建 secrets、Auth、org、goal、history、audit、其他功能或正式專案。七日到期即停止外呼；應用不落地原始 prompt/response，已知帳務結算後清除本次試驗 metadata，未知帳務保留至對帳，不宣稱已完成清除。程式庫內的固定合成測試樣本是測試 fixture，不是真實客戶材料。

離線證據：handler 11 tests、PGlite SQL 12 groups、handler→SQL integration 2 groups、所有 migrations 編譯／既有 goal SQL 9 groups。Auth/provider 是 doubles，PGlite PG18.3 不代表 native concurrency。CI 新增 postgres:17.6 一次性容器測試：network=none、Unix socket、無 TCP／密碼／cloud，A/B/C 真實獨立 PID、B Lock blocker=A、僅一筆預留成功、失敗交易整笔回退；本機 Docker daemon 不運行，結果以該 head CI 實際輸出為準。部署／live模型費／UI／真實Auth未驗收，M1不放行。
