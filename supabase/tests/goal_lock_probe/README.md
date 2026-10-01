# M1 受限鎖驗收通道：真實重疊與完整撤回驗收已通過

這不是 migration，自動部署不會套用。只適用隔離專案 `vhzryhibmpvglzcmfnaa`。
2026-10-01 已按批准套用遠端 NOLOGIN 預備。兩角色均不能登入，activation_window 的 starts_at／deadline 均為 NULL；未設定密碼或啟用窗口。固定網址提示與自然 JWT 驗收已 PASS，不重做。

## 原批准範圍（歷史草案，不另發表單）

是否允許只在 Growth OS 測試 Supabase 建立此處 SQL 所列的兩個 probe 角色及一個固定探測函式，在批准的精確啟用時間起兩小時內、最多三條連線，只對 Fixture A 目標 `5055ca31-40cc-435d-9f52-cdf19166440c` 探測？它只能以既有 Fixture A owner 追加最多一筆固定合成受眾修正；驗收會 rollback，但 SQL client 具有 commit 能力。完成／失敗即按 cleanup.sql 撤回通道，不改現有 RLS、登入網址、共享帳號、正式專案或付費。新 probe 密碼由本人在安全、不回顯的 psql 提示輸入，不貼進聊天或檔案。

## 日期與檔案

- `create.sql.template`：完整原子建立 SQL；LOGIN 起初禁用，可信 NOLOGIN owner 不繼承 authenticated 或管理角色。
- `activate.sql.template`：只啟用已查核屬性的角色，不含密碼值。先由本人用 `\password growth_os_probe_login` 安全輸入；不要將此指令改成含明文密碼的 SQL。
- `verify.sql`：三條連線的屏障協定；不是可依序跑完的「並行測試」。
- `cleanup.sql`：固定角色與固定函式清理；無 CASCADE，意外依賴必須停止。
- `render.mjs`：只生成離線 SQL，不連線或執行。必須給精確 ISO UTC 起點；沒有預設、相對日期或自動延長。

批准啟用時，記錄實際批准的精確 UTC 起點 T0，截止 T1 固定為 T0+2h。使用 `node render.mjs "$approved_start_utc" "$review_output_directory"` 生成 create／activate／verify／cleanup 與 window.json，先讓批准者核對 T0、T1 與 SQL。文件中的兩個 shell 變數須由該次批准紀錄提供；不可猜測日期或直接跑未替換的 template。生成不會上線。延遲不延長期限；若剩不到 15 分鐘，activate 拒絕，須重新取得明確時間窗口與審查結果。

create 不帶時間，先建立管理者擁有、probe LOGIN 無權讀寫的 activation_window，起點與截止皆為 NULL。只有之後核對並執行 activate 才原子寫入 T0／T1、設定 VALID UNTIL 並啟用 LOGIN；不得重複啟用或自動延長。函式讀取該窗口，入口與 RPC 等鎖返回後各檢查截止。VALID UNTIL 只阻止新密碼登入，不會關閉既有連線；session timeout 預設也可被 SQL client 改寫。不能承諾已返回但尚未 commit 的交易會在 T1 自動取消；控制器需準時 rollback／關閉，cleanup 只終止此 probe role 的 session。

## 安全邊界

LOGIN 沒有表權限、原 RPC EXECUTE、private schema USAGE、其他角色會員權或 CREATE。零參數 definer 固定 org、goal、actor、expected_version=13、question_key 與答案，並覆寫 legacy sub 和 JSON claims；caller 的任意 claims 不能換租戶。可信 NOLOGIN owner 只有 schema USAGE 與兩個指定 RPC EXECUTE，暫授 schema CREATE 在原子建立交易結束前撤回。PUBLIC／anon／authenticated／service_role 都不能進入 probe schema／函式。

原 private RPC 內部依 membership 授權，並由 postgres definer 追加資料。因此單純將 authenticated 或 RPC 授給直連 LOGIN 會接受偽造 claims；本設計用已批准的受控 definer 限定 Fixture A。最大一筆能力基於固定 expected_version=13；其他正常使用者的更新會使 probe PT409 停止，不能自動改版本以繼續。沒有自動還原／刪除合成追加。

## 本地證據與限制

`.github/workflows/python-tests.yml` 已接入同一份 `node supabase/tests/goal_lock_probe/test.mjs`，沿用前面的 `npm ci --ignore-scripts` 安裝 PGlite。CI 只在記憶體內執行既有 9 組邊界測試，不連線 Supabase、不需要 credential、不啟用遠端角色或窗口。接線提交 028c09f 的 push／PR CI 36754861356／36754865648 均 success，第 15 步與 9 組測試均通過；這仍不代表遠端並行驗收。

`test.mjs` 用現有 PGlite，只跑新增 probe 邊界測試；延後窗口版 9 組通過，結果在 outputs/Growth-OS-probe-deferred-local.json。auth.uid 的 coalesce legacy／JSON 定義已與遠端唯讀定義核對。測試覆蓋 NULL 窗口拒絕、PUBLIC／其他角色拒絕、無參數、偽造兩種 claims、原 RPC／表／DDL／SET ROLE 拒絕、固定租戶、rollback、最多一筆 commit、硬截止、角色屬性目錄、啟用目錄與精確清理。PGlite 的 session_user 來自 SET SESSION AUTHORIZATION 模擬，不能宣稱真實密碼登入、連線數／到期 enforcement 或雙後端重疊。

## 遠端預備與本人密碼交接

遠端 migration `growth_os_probe_nologin_preparation` 已成功。PostgreSQL 17 初次移轉函式 owner 缺 SET ROLE 能力，整個交易回退，確認無角色或 schema 殘留後修正；現在只在建立交易內暫授管理者 SET、移轉後撤回。讀回證據 outputs/Growth-OS-probe-nologin-readback.json：probe 兩角色自身無其他角色會員權；平台保留 postgres 對新角色的 ADMIN=true、INHERIT=false、SET=false，不能誤寫成整張會員目錄為空。兩角色 NOLOGIN、窗口 NULL、目標仍 13 筆。

本人在 Terminal 執行 `set_probe_password.command`。它固定連線隔離測試專案的 session pooler，使用 psql `-X -W`、TLS verify-full、停用密碼檔與環境密碼，再用 `\password growth_os_probe_login` 的不回顯提示輸入既有管理密碼及新 probe 密碼兩次。腳本不接受密碼參數、不保存密碼、不啟用 LOGIN 或窗口；請勿將密碼貼进聊天、SQL Editor、命令列、檔案或日誌。若不知道既有管理密碼，停止，不重設共享密碼。腳本語法檢查通過；實際連線與密碼設定尚待本人操作，未宣稱通過。

本人完成後只回報是否成功；後續才核對實際 T0／T1 並啟用兩小時窗口。完成／失敗立即執行精確 cleanup：禁用 LOGIN、撤回函式執行、只終止該 probe 的 session，再撤回授權並移除固定函式、窗口表、schema 與兩角色。不使用 CASCADE，不刪除業務資料。

### 2026-10-01 TLS 修復與無密碼驗證

本人初次執行遇到 `certificate verify failed`，未確認密碼設定成功。原腳本使用 libpq 17.6 的 `PGSSLROOTCERT=system`，Homebrew OpenSSL CA store 無法驗證 pooler 使用的 Supabase Root 2021 CA；清空 credential 環境並使用 psql -w 重現相同 TLS 錯誤，OpenSSL 回報 self-signed certificate in certificate chain (19)。這是客戶端信任鏈缺口，不能判定為密碼錯誤。

依 [Supabase 官方 psql 說明](https://supabase.com/docs/guides/database/psql)，保持 verify-full 並明確指定官方 CA。CA 來源由 [官方 Dashboard 設定](https://github.com/supabase/supabase/blob/cf063c4ae8674d6b18dd7894a17563e16e013cd2/apps/studio/hooks/custom-content/custom-content.json) 的 ssl:certificate_url 與 [SSLConfiguration](https://github.com/supabase/supabase/blob/cf063c4ae8674d6b18dd7894a17563e16e013cd2/apps/studio/components/interfaces/Settings/Database/SSLConfiguration.tsx) prod 環境對照確認，經驗證 HTTPS 下載 [prod-ca-2021.crt](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)。隨此目錄保存的只是公開 CA，沒有私鑰。SHA256 憑證指紋 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`，有效至 2031-04-26；脚本先核對指紋，再將 PGSSLROOTCERT 指向同目錄檔案。不從未驗證 server chain 接受根憑證，不修改全域信任；日後 CA 輪替必須重新由官方來源核對。

新增 `set_probe_password.command --check-tls` 僅用 OpenSSL 檢查固定 session pooler，不傳送帳號密碼、不執行 SQL。實測 certificate／hostname 驗證 OK、return code 0；錯誤 hostname 仍拒絕 (62)。同一 libpq 改用明確 CA 後，無密碼連線只回報 `fe_sendauth: no password supplied`，代表 TLS 已通過、仍停在 credential 邊界。本人模式使用臨時空白 0600 密碼檔阻止讀取已存憑證，退出即移除；該檔不寫入任何密碼。TLS log 在聊天 outputs，不能當作密碼設定成功或真正登入 PASS。

本人最小重試：重新執行本目錄最新 `set_probe_password.command`（不帶參數），依不回顯提示輸入既有管理密碼及新 probe 密碼兩次。不要貼密碼到聊天或命令列；若再失敗，只回報錯誤文字，先停止。2026-10-01 02:03:58 UTC 唯讀核對仍為兩角色 NOLOGIN、window NULL、probe sessions 0、原歷史 13；不得因此提前啟用窗口。

本機另確實裝有 PATH 外的 PostgreSQL 14.19 server。`native_overlap.py` 只嘗試独立 `/private/tmp`、0700 Unix socket、無 TCP listener 的合成 cluster，未碰既有 daemon。既有 Homebrew keg 缺編譯期 `/opt/homebrew/share/postgresql@14/timezonesets` 資源路徑；使用既有 libraries／share 與任務暫存 runtime 仍無法啟動。暫存檔已清除，沒有留下 server。未修改全域 symlink、安裝／升級或開服務；native 與遠端重疊均 **未 PASS**。後續修復全域安裝超出本輪授權，不自行執行。

即使之後本地原生重疊成功，它也只證明合成 schema／RLS／RPC 的鎖等待與 rollback；不能代替遠端 deployed SHA、Supabase session pooler、真實 Auth／自然 JWT 到期的證據。

## 三連線本人交接控制器與啟用前 ACL 審查

`run_probe.command`／`remote_overlap.py` 已備妥，沒有啟用能力。只有主管審查 ACL、保存原 13 筆與 audit 基準、確認本人可操作及明確批准精確 T0/T1 後，才由主管產生本目錄 `approved-window.json`（start、deadline、approved=true、project=vhzryhibmpvglzcmfnaa），再以 activate SQL 啟用。此檔目前故意不存在，缺檔、未開始、過期、少於 15 分鐘或非兩小時窗口都在登入前停止；離線 renderer 的 reviewOnly window.json 不等於批准。

本人只啟動一次介面：psql -X -W 依序 A/B/C 各由本人在 /dev/tty 不回顯輸入同一 probe 密碼，控制器不讀輸入、不用 argv/env/file/管線傳密碼。子程序環境只保留固定非敏感連線設定、verify-full／官方 CA 与臨時空密碼檔；SQL stdin 管線與 stdout 只包含固定 SQL／查詢結果，stderr 直接給本人 Terminal，不保存。每次登入等待上限 180 秒。這仍待本人實際 Terminal 操作驗證，不以 agent 可讀 CA 或離線 fake sessions 當作真人介面 PASS。

A/B/C 身份必須都是 probe_login，PID 三者不同；開始交易前設 statement_timeout=15s、lock_timeout=5s、idle transaction=30s。A 呼叫零參數固定函式取得版本14但不提交，B 開始同一呼叫；C 最多4秒找 B wait_event_type=Lock 且 blocker含A。取得同時屏障後 A rollback，B 返回版本14再 rollback，三連線結束。没有證據／任一步失敗都不得記 PASS；disconnect/terminate 使未提交交易回退。最多三條 probe 連線，之後清理用的管理連線是不同角色，不屬於 probe 的 connlimit3。

完成／失敗後本人需再輸入管理密碼一次，執行精確 cleanup.sql。本人 psql 使用 autocommit，不加 --single-transaction：NOLOGIN 先提交，只終止 probe session，再開始可能失敗的物件 ACL 交易。若管理密碼提示等待、取消、OS 中斷或前置檢查失敗，主管必須立即以既有管理 connector 接手，勿等本人輸入或 VALID UNTIL；它不會關閉既有連線。無法承諾無人在場時所有中斷均自動撤回。

管理 connector 精確備援見 `emergency_disable.sql`，每一步是**獨立 connector action**，不可一次送入共同／隱式交易，也不可與可能失敗的 ACL／DROP 合併：

1. `apply_migration` 只送第一個 `ALTER ROLE growth_os_probe_login NOLOGIN;`，確認成功提交。
2. `execute_sql` 只送第二個精確 role 的 `pg_terminate_backend` SELECT，不碰共享或其他 session。
3. `execute_sql` 只送第三個狀態 SELECT，確認 can_login=false、sessions=0；必要時重複第二、三步。
4. 以上封鎖已持久化後，才單獨以 `apply_migration` 執行 cleanup.sql 的剩餘 ACL／物件撤回。即使此步失敗，前兩步不回退；依賴不符要停止處理，不用 CASCADE。

主管再用 readback.sql 核對兩角色/schema全撤回、原歷史與 audit 基準相同。證據只記窗口、PID、同時 Lock/blocker、rollback／退出狀態；即使 runner返回0仍 full_acceptance=false，須上述唯讀比對才能全面通過。清理失敗或歷史改變是 blocker，不自動刪歷史或改expected_version。

遠端唯讀 ACL 差異：OID18474，`growth_os_probe.append_fixture_turn()` 零參數、owner probe_owner、definer、空search_path／lock_timeout5s 正確；但 ACL 為 PUBLIC=X 與 owner=X，login 從 PUBLIC 得 EXECUTE，沒有 explicit login grant。anon/authenticated/service_role 可 EXECUTE 但 schema USAGE=false，尚不能進入；Data API exposed schemas 清單未取得確證，不將此說成已確認的公開API。owner function defaults 無額外設定，管理者 postgres 只有對 owner 的 ADMIN=true、SET/INHERIT=false。原模板在撤回臨時 SET 後以非 owner做REVOKE/GRANT，是必要的 operator 檢查缺口；新增非superuser PGlite 實測此路徑DCL不生效、留下PUBLIC，與遠端結果相符，但不能在沒有DDL歷史的情況斷言遠端每一步原因或歸咎ALTER OWNER。

`reconcile_acl.sql` 的單一安全審查項目僅為 OID18474 函式 ACL 修正，無 LOGIN、窗口或密碼變更。前置精確核對 zero-arg／owner／definer／config／原 ACL，以及全部相關 pg_auth_members：僅兩條 grantor=supabase_admin、member=postgres、role 分別 probe_owner/probe_login，ADMIN=true、SET=false、INHERIT=false。operator 必須 postgres NOSUPERUSER CREATEROLE。以 `GRANTED BY postgres` 新增 ADMIN=false、SET=true、INHERIT=false 的臨時 owner grant，再 SET LOCAL ROLE owner 撤回 PUBLIC/client、授予 login；RESET ROLE 後 `REVOKE ... FROM postgres GRANTED BY postgres RESTRICT` 只撤回此次 grantor 的 grant，保留 supabase_admin 原兩條。完整 membership（包含 OID、grantor、admin/set/inherit）與 pg_proc 除 ACL 的全部欄位、兩角色非秘密屬性均 before/after 相等；最終 ACL 精確只含 owner/login EXECUTE，grantor 均 owner。任一不符回退整筆交易。沒有原 membership 漂移修復或自動放寬前置的權限。

語意依据 [PostgreSQL 17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html) 與 [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html)：角色 membership 的 GRANTED BY 決定授權來源，撤回需明確指向該 grantor。本機 PGlite 0.5.8 實際引擎是 **PostgreSQL 18.3 WASM**，模型把真實 postgres NOSUPERUSER operator 映射為 probe_operator、supabase_admin grantor 映射為 bootstrap postgres，OID 18474 映射為合成函式 OID。它不能證明遠端 PG17 執行、MCP 交易邊界、真實密碼／TTY／TLS／獨立後端並行；PG17 目前只有文件語意核對，精確遠端 SQL 尚待單項審查後套用及讀回。

本批本機驗證：6 個 ACL 模型案例（成功、變更 ACL 後故意 division-by-zero、OID/ACL/membership/owner 漂移）；失败案例核對預期拒絕原因與 rollback 後完整 ACL／定義／membership／非秘密角色屬性／窗口一致。成功案例另驗證獨立提交 NOLOGIN/terminate 後 ACL 清理故意失敗，role 仍 NOLOGIN、原 membership 不變。8 個 controller unittest 通過；新增前置失敗絕不登入或開管理密碼流程、明示獨立 connector 備援。mock 不算 TTY/TLS/遠端 PASS。既有9組 probe與自然JWT PASS 未重跑，本批未 push 或部署。

create 與 activation 的早期修正仍為本地模板；不再建立已存在的遠端角色。窗口仍待確切 T0/T1、基準 hash、管理備援在場與本人安全操作就緒後才啟用。密碼由本人 psql 無回顯收取；agent 不代填或記錄。此輪只完成本機審查包，未作遠端動作。

`readback.sql` 為主管管理 MCP 的唯讀前後比對：固定目標本體、完整13筆歷史與該目標audit的SHA256／count；不回傳答案明文。啟用前與清理後使用同一UTC timezone執行，goal/history/audit hash須逐項相同，後者schema不存在、角色清單空、probe sessions=0。其後即使controller有Lock證據，若比對不符仍不能PASS。此檔不讀password/hash或認證token。


## 2026-10-01 12:51 台北：精確 ACL 遠端套用與獨立讀回

本人已批准上述單一 ACL 交易。原樣執行 commit 1d984520e14d10a6570c296c06b7b5ca4fd652dc 的 reconcile_acl.sql（SHA256 d5809d9890e699b79b2ef367a9d5965a2c3f5c2c2a7a84aadcc22221e973d64a），隔離專案 vhzryhibmpvglzcmfnaa migration `growth_os_probe_exact_acl_reconciliation` 回報 success=true。所有交易內前後 guard 通過，未放寬或修改批准 SQL。

獨立 connector 讀回為 PG17.6：OID18474、owner、zero-arg、definer、config 與 pg_proc 除 ACL 的 hash 相同；ACL 精確只含 owner/login EXECUTE，grantor=owner，無 grant option；PUBLIC 無條目，anon/authenticated/service_role effective EXECUTE=false。兩條原 membership OID18461/18463 與全部欄位未變：grantor=supabase_admin、member=postgres、ADMIN=true、SET=false、INHERIT=false；臨時 postgres grant 已移除。兩角色仍 NOLOGIN、窗口 starts_at/deadline=NULL、probe sessions=0。

交易前後目標 hash、13 筆歷史 hash/count、13 筆 audit hash/count 全部一致。客觀證據保存在專案工作區 outputs/Growth-OS-probe-acl-remote-1d98452.json。本節取代前述「ACL 尚未套用」的目前狀態；本機 PG18.3 模型與 PG17.6 實際 ACL 套用證據分開保留，不把 ACL 成功視為真實密碼／TTY／三連線重疊 PASS。

已複核三連線 handoff：缺少 approved-window.json 會在登入前停止、controller 不啟用窗口、本人 psql -W /dev/tty 無回顯輸入、無密碼 argv/env/保存、verify-full 與官方 CA、3 個不同 probe PID、B Lock/blocker=A 後兩交易 rollback 並關閉連線。管理密碼等待或取消／OS 中斷時主管即時分別提交 NOLOGIN、終止精確 probe sessions、觀測 false/0，然後才進行可失敗的物件 cleanup。此複核屬程式／操作流程審查，尚未請本人操作，也未啟用窗口；後續仍需精確 T0/T1、本人就緒、管理 connector 在場、當次基準與最終唯讀核對。自然 JWT 不重跑。


## 2026-10-01 13:35 台北：真實三連線重疊與完整撤回 PASS

本人 ready 且既有受限窗口批准下，用當下 UTC 渲染並啟用 T0=2026-10-01T05:31:41.000Z、T1=2026-10-01T07:31:41.000Z，沒有延長期限或增加權限。本人運行既有 run_probe.command，psql 管理清理退出碼 0；agent 未讀、輸入、傳送或保存密碼，也未執行額外備援 DDL。自然 JWT 不重跑，無新部署／push。

真實 controller 證據是 `outputs/Growth-OS-probe-overlap-2031d5ec719d4504bc31a51b86d2fea2.json`：A PID366169、B PID366171、C PID366172 三者不同；05:33:26.974588UTC，B active／wait_event_type=Lock、blockers含A；雙方 rollback=true、client_connections_closed=true。Supavisor idle 後端在 client close 後短暫保留，不能把關閉 client 當作 sessions=0；本人管理 cleanup 隨後完成角色封鎖、精確後端終止及物件撤回。

05:35:25.08033UTC 獨立管理讀回：goal/history/audit hash 全與 05:31:41 啟用前基準相同，history/audit 各13。05:35:31.289299UTC 再次目錄讀回 probe function、schema、roles、sessions 均0。完整可信整合證據 `outputs/Growth-OS-probe-final-acceptance-20261001.json` 的 full_probe_acceptance=true；原 controller 的 full_acceptance=false／readback_pending 保留不改寫，因 controller 自身不能作管理端最終判定。本節為此受限重疊驗收的完成狀態，歷史待驗段落不再代表現況。

本機 approved-window.json 已移至 `outputs/Growth-OS-probe-window-20261001/approved-window.closed.json` 歸檔；原執行位置沒有批准檔，防止再次啟動。render SQL、窗口批准與 activation 獨立讀回皆保留。本次通道完全撤回，禁止以舊窗口重建或重跑。本次 PASS 只涵蓋固定 Fixture A 的鎖重疊、雙 rollback、清理與資料完整性；其他產品里程碑依原路線圖驗收，不把本次證據延伸為未測項目通過。
