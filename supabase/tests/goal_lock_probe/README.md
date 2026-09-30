# M1 受限鎖驗收通道：已批准 NOLOGIN 預備，窗口尚未啟用

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

`.github/workflows/python-tests.yml` 已接入同一份 `node supabase/tests/goal_lock_probe/test.mjs`，沿用前面的 `npm ci --ignore-scripts` 安裝 PGlite。CI 只在記憶體內執行既有 9 組邊界測試，不連線 Supabase、不需要 credential、不啟用遠端角色或窗口。此接線尚未 push，遠端 CI 尚未執行，不能記為遠端验收通過。

`test.mjs` 用現有 PGlite，只跑新增 probe 邊界測試；延後窗口版 9 組通過，結果在 outputs/Growth-OS-probe-deferred-local.json。auth.uid 的 coalesce legacy／JSON 定義已與遠端唯讀定義核對。測試覆蓋 NULL 窗口拒絕、PUBLIC／其他角色拒絕、無參數、偽造兩種 claims、原 RPC／表／DDL／SET ROLE 拒絕、固定租戶、rollback、最多一筆 commit、硬截止、角色屬性目錄、啟用目錄與精確清理。PGlite 的 session_user 來自 SET SESSION AUTHORIZATION 模擬，不能宣稱真實密碼登入、連線數／到期 enforcement 或雙後端重疊。

## 遠端預備與本人密碼交接

遠端 migration `growth_os_probe_nologin_preparation` 已成功。PostgreSQL 17 初次移轉函式 owner 缺 SET ROLE 能力，整個交易回退，確認無角色或 schema 殘留後修正；現在只在建立交易內暫授管理者 SET、移轉後撤回。讀回證據 outputs/Growth-OS-probe-nologin-readback.json：probe 兩角色自身無其他角色會員權；平台保留 postgres 對新角色的 ADMIN=true、INHERIT=false、SET=false，不能誤寫成整張會員目錄為空。兩角色 NOLOGIN、窗口 NULL、目標仍 13 筆。

本人在 Terminal 執行 `set_probe_password.command`。它固定連線隔離測試專案的 session pooler，使用 psql `-X -W`、TLS verify-full、停用密碼檔與環境密碼，再用 `\password growth_os_probe_login` 的不回顯提示輸入既有管理密碼及新 probe 密碼兩次。腳本不接受密碼參數、不保存密碼、不啟用 LOGIN 或窗口；請勿將密碼貼进聊天、SQL Editor、命令列、檔案或日誌。若不知道既有管理密碼，停止，不重設共享密碼。腳本語法檢查通過；實際連線與密碼設定尚待本人操作，未宣稱通過。

本人完成後只回報是否成功；後續才核對實際 T0／T1 並啟用兩小時窗口。完成／失敗立即執行精確 cleanup：禁用 LOGIN、撤回函式執行、只終止該 probe 的 session，再撤回授權並移除固定函式、窗口表、schema 與兩角色。不使用 CASCADE，不刪除業務資料。

本機另確實裝有 PATH 外的 PostgreSQL 14.19 server。`native_overlap.py` 只嘗試独立 `/private/tmp`、0700 Unix socket、無 TCP listener 的合成 cluster，未碰既有 daemon。既有 Homebrew keg 缺編譯期 `/opt/homebrew/share/postgresql@14/timezonesets` 資源路徑；使用既有 libraries／share 與任務暫存 runtime 仍無法啟動。暫存檔已清除，沒有留下 server。未修改全域 symlink、安裝／升級或開服務；native 與遠端重疊均 **未 PASS**。後續修復全域安裝超出本輪授權，不自行執行。

即使之後本地原生重疊成功，它也只證明合成 schema／RLS／RPC 的鎖等待與 rollback；不能代替遠端 deployed SHA、Supabase session pooler、真實 Auth／自然 JWT 到期的證據。
