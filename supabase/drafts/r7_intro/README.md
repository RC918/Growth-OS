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

auth.users/auth.uid 為隔離 fixture 身分注入；不是 GoTrue/JWT 真登入測試。PGlite 執行 PostgreSQL SQL/RLS，並非 JS mock；不宣稱多後端 PostgreSQL 連線競態或 hosted Data API 已驗。advisory transaction lock＋unique(org,version)保障版號序列；JS client競態另有測試。

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
