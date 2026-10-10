# R7 最小 SQL 候選（未部署）

只支持既有 R7 frame／候選；不接受其他文案、不偽造 product，不部署 dashboard schema。proposal.sql 是沿既有 drafts 慣例的可審 migration 候選，不是已套用 migration。SHA256.json 綁定三份 SQL；原資料來自公開 intro-r7.json。

## 範圍

- private members：既有 auth.users 的明確 user→org/role 歸屬，不建立帳號。
- private write_gate：預設 false、固定 actor/org、到期自動拒絕。
- private versions / confirmations / audit：不可由 API 直接 DML；來源與候選固定，版號追加、確認綁 exact version。
- public security_invoker views：r7_members、intro_versions，讀取由底層 RLS 限 tenant。
- public invoker RPC：save_r7_intro、confirm_r7_intro；private definer 只為無直接 DML 授權時的原子驗證／寫入／audit。search_path 固定空、auth.uid＋membership＋gate 檢查；不信任 user_metadata/client actor。
- 所有 API roles 的 read/execute 預設撤銷。enable.sql 才以已確認身分、org、最長一小時期限開放；disable.sql 關 gate 並撤銷所有 writer entry，保留既有 RLS 讀回。
- SQL 比對完整固定 JSON 語義並保存固定 frame 的原 JSON 序列，避免 jsonb key 重排破壞 R7 瀏覽器 hash。client 語義比較不依賴 row key 順序；候選 hash 驗證仍使用原 frame。

## 真 SQL 隔離驗證

`node --test supabase/drafts/r7_intro/offline.test.mjs` 使用既有 PGlite 0.5.8，不新裝套件、不連遠端。執行 exact proposal/enable/disable SQL。8 子測試＋主測試 PASS：預設 ACL、gate、request replay／mismatch、完整frame、audit、跨 tenant RLS、viewer/anon/直接 DML 拒絕、版本失效、錯來源、audit失敗回滾、持久目錄關閉重開讀回、实际 workspace API→SQL→丟回應→精確 reconcile、停用後可讀不可寫。

auth.users/auth.uid 為隔離 fixture 身分注入；不是 GoTrue/JWT 真登入測試。PGlite 執行 PostgreSQL SQL/RLS，並非 JS mock；hosted Data API 仍未驗；新增的原生 PG17 多連線期限／停用驗證見下節。advisory transaction lock＋unique(org,version)保障版號序列；JS client競態另有測試。

## 最小入口

apps/web/r7-workspace.html → r7-workspace.mjs → R7 專用 createR7WorkspaceApi adapter，只查 public.r7_members，從不呼叫 dashboard 或舊 staging。沿用既有 verified Auth session 驗證模式、專用 intro-save-panel。回呼路徑限定 /r7-workspace.html；不自動建立使用者。intro-save-config=false，r7-workspace-runtime 的 key=null，因此目前不會送任何登入或保存請求。原完整 workspace 功能與 runtime 保留，不把舊 key 搬到新 pilot。1280/390 瀏覽器已驗預設入口零請求，以及僅攔截到 synthetic transport 的啟用入口回呼、r7_members、保存與確認；無真 Auth 請求。

## 精確遠端 preflight（唯讀，另待授權執行）

1. 正式 connector 確認 project=wqepyttadrcnphtyjpjy、ACTIVE_HEALTHY、Free 與 US$0 邊界；禁止舊 staging。重新核 public schema/migrations，不能用先前 empty 結果覆蓋新物件；同名 schema/view/function 已存在就停止比對。
2. 核 PostgreSQL 支援 security_invoker views、gen_random_uuid/auth.uid、auth.users；檢查角色既有 ACL/default ACL。Data API 僅 public，r7_private 不加入 exposed schemas；不能為解權限開整個 public 或 wildcard grants。
3. 核實 Owner 的既有 Auth user UUID、唯一組織歸屬與授權（不寫入 public repo），auth email callback allowlist 只含實際 HTTPS /r7-workspace.html；確認既有寄信能力。若帳號不存在／寄信需付費或新憑證，集中提出，不能自建帳號。
4. 取得新 pilot 的正式 publishable key；它不是 service_role secret，仍不可猜或沿用舊 key。瀏覽器不得取得資料庫密碼／service_role；SQL 管理僅正式授權 connector，無新永久凭證。

## 批准後啟用順序（本輪未執行）

- 經 Reviewer 核對 SHA 後套用 proposal.sql（讀写仍全關），核對物件 owner、ACL/RLS、空資料與 gate false；若需正式 migration 檔，依當前 Supabase CLI/技能建立並保持 SQL bytes，不從舊 migrations 整套套用。
- 在已核實 project 的同一受控連線，以 session settings r7.actor_id/r7.organization_id/r7.expires_at 傳入核准值，再執行 enable.sql；值不進 repo/log。只為該 actor/org 開最長一小時 writer。
- 僅發布 R7 專用入口的必要靜態依賴，配置正式 publishable key、精確 callback/CSP，才開 client flag；不部署整套 dashboard、不改既有私有核稿站或原產品網站。發布另需該輪明確批准。
- 執行一次指定 R7 保存→確認→登出→新登入精確版本讀回；核來源/hash/audit及未授權tenant否定案例。預期以外結果停用，不重試未知 mutation。
- 驗收完成或異常立即 disable.sql，client flag=false；保留不可改版本/audit及受限讀回。取消 client flag 不能代替 server revoke。完整撤銷讀取可另撤 SELECT/USAGE，不刪資料或 Auth user。沒有 live PASS 前不稱跨帳號session／跨裝置已完成。

修正紀錄：ee92009 的 CI 38021395960/38021398920 另暴露 frozen RC 三檔不可修改。已將原 workspace-api/html/mjs 與鏡像恢復 b83b1fb 的已審 bytes，manifest/assertion 不變；專用 R7 adapter 與入口不依賴 frozen dashboard。不是放寬或更新 frozen hash。

## 2026-10-10 必要期限修正（離線）

Reviewer 已核准 6502b3 的兩個 P2 修正；本次只補嚴格期限啟用前必要缺口：初始 gate 檢查不能授權等待中的 writer。組織 advisory lock 取得後，再 SELECT singleton gate FOR SHARE，核 enabled／actor／org／clock_timestamp 截止；鎖持有至交易結束。函式結束前再核 clock_timestamp，若版本/audit 的後續鎖等待跨過期限，exception 回滾所有變更。

Disable 序列語意：其 UPDATE 與 writer 的 SHARE 衝突。尚未取得 gate 的 writer 若遇到已提交 disable，必須拒絕；若 disable 尚未提交，writer 等待 gate，取得後核新列；若 writer 已先獲准並持有 SHARE，disable 等其交易結束後才完成，**不回溯取消已進入交易**。disable 返回成功代表之前持有 gate 的交易已結束、後續 writer 不能進入。enable 使用同一行 UPDATE，因此也遵守此鎖序。期限檢查點是鎖後與函式返回前，不宣稱可控制 PostgreSQL 的 WAL/commit 實際落盤時刻；正式 Data API 採單 RPC autocommit，不能另包長期開啟的 client SQL transaction。

`node supabase/drafts/r7_intro/native-deadline.mjs`：使用既有 digest-pinned postgres:17.6，network none、無 host port、無外部凭證、不 pull；7 個 native 多連線案例 PASS。以 pg_blocking_pids 及三個不同 backend PID 證明 writer 確實在另一連線持鎖時等待；Save/Confirm 各測到期、disable；另測 gate 行鎖 disable-first、writer-first disable 等待、audit 等待到期整筆回滾。被拒絕案例 versions/confirmations/audit 三者零增量。測試 UUID 僅合成 fixture，未填入真 Owner/org 到 enable.sql。

## 首次登入前唯讀 enrollment 候選（待獨立 Reviewer，未執行遠端）

`enroll-readonly.sql` 只接受父端正式 invitation/authoritative Auth 查得的 actor UUID 與父明確提供的新專用 org；值以私有 session settings `r7.actor_id`、`r7.organization_id` 提供，檔案無 email/UUID/私人URL。檢查 Auth user 已存在即可（此時尚待本人點驗證信），不代驗 email、不建立 Auth user。

單筆 transaction：FOR UPDATE 鎖 gate，要求 untouched gate=false、actor/org null、期限已過；拒絕重派會員或共用他人 org；insert owner membership；僅授 authenticated 私有 schema USAGE、members/versions/confirmations 與兩 views SELECT，仍受 RLS；明確撤除所有 API writer EXECUTE。無 gate UPDATE、無 deadline、無 audit/gate讀權、無版本/確認寫入。相同身分重覆 enrollment 無副作用，但不授權盲目重送未知結果。若 gate 曾啟用，即使後來 disable 也拒絕這份首次 enrollment。

順序：proposal closed → 原 Reviewer 審 enrollment hash → 父提供 verified actor/org 並明確派執行 → readonly enrollment → accessEnabled=true / writer=false 登入頁 → Owner本人點信並正式 Auth驗證、membership讀回 → 才以既有 enable.sql 設最多一小時 deadline → 一次保存、一次確認及新登入讀回 → disable。不可用先enable再disable替代enrollment，也不可從invite時開始消耗一小時。所有額外遠端動作由父單一協調。

`node --test supabase/drafts/r7_intro/enroll-readonly.test.mjs supabase/drafts/r7_intro/offline.test.mjs`：16 PASS（enrollment主測＋6子測；既有SQL主測＋8子測）。涵蓋缺設定／無Auth／錯org、membership及tenant衝突、active或已用gate拒絕、相同enrollment重放不變、owner讀回、other零列、anon/directDML/RPC拒絕、audit/version/confirmation零增量、後續獨立enable/disable仍可讀。僅PGlite synthetic UUID，不是真Auth或遠端enrollment證據。CI接入既有R7 step；原proposal/enable/disable hash與dist bytes不變。
