# M1 受限鎖驗收通道：待批准本地草案

這不是 migration，自動部署不會套用。只適用隔離專案 `vhzryhibmpvglzcmfnaa`。
沒有遠端角色、密碼或安全變更；固定網址提示驗收已 PASS，不重做。

## 單一批准請求草案（不另發表單）

是否允許只在 Growth OS 測試 Supabase 建立此處 SQL 所列的兩個 probe 角色及一個固定探測函式，在批准的精確啟用時間起兩小時內、最多三條連線，只對 Fixture A 目標 `5055ca31-40cc-435d-9f52-cdf19166440c` 探測？它只能以既有 Fixture A owner 追加最多一筆固定合成受眾修正；驗收會 rollback，但 SQL client 具有 commit 能力。完成／失敗即按 cleanup.sql 撤回通道，不改現有 RLS、登入網址、共享帳號、正式專案或付費。新 probe 密碼由本人在安全、不回顯的 psql 提示輸入，不貼進聊天或檔案。

## 日期與檔案

- `create.sql.template`：完整原子建立 SQL；LOGIN 起初禁用，可信 NOLOGIN owner 不繼承 authenticated 或管理角色。
- `activate.sql.template`：只啟用已查核屬性的角色，不含密碼值。先由本人用 `\password growth_os_probe_login` 安全輸入；不要將此指令改成含明文密碼的 SQL。
- `verify.sql`：三條連線的屏障協定；不是可依序跑完的「並行測試」。
- `cleanup.sql`：固定角色與固定函式清理；無 CASCADE，意外依賴必須停止。
- `render.mjs`：只生成離線 SQL，不連線或執行。必須給精確 ISO UTC 起點；沒有預設、相對日期或自動延長。

批准啟用時，記錄實際批准的精確 UTC 起點 T0，截止 T1 固定為 T0+2h。使用 `node render.mjs "$approved_start_utc" "$review_output_directory"` 生成 create／activate／verify／cleanup 與 window.json，先讓批准者核對 T0、T1 與 SQL。文件中的兩個 shell 變數須由該次批准紀錄提供；不可猜測日期或直接跑未替換的 template。生成不會上線。延遲不延長期限；若剩不到 15 分鐘，activate 拒絕，須重新取得明確時間窗口與審查結果。

函式硬編碼 T0/T1，入口與 RPC 等鎖返回後各檢查截止。VALID UNTIL 只阻止新密碼登入，不會關閉既有連線；session timeout 預設也可被 SQL client 改寫。不能承諾已返回但尚未 commit 的交易會在 T1 自動取消；控制器需準時 rollback／關閉，cleanup 只終止此 probe role 的 session。

## 安全邊界

LOGIN 沒有表權限、原 RPC EXECUTE、private schema USAGE、其他角色會員權或 CREATE。零參數 definer 固定 org、goal、actor、expected_version=13、question_key 與答案，並覆寫 legacy sub 和 JSON claims；caller 的任意 claims 不能換租戶。可信 NOLOGIN owner 只有 schema USAGE 與兩個指定 RPC EXECUTE，暫授 schema CREATE 在原子建立交易結束前撤回。PUBLIC／anon／authenticated／service_role 都不能進入 probe schema／函式。

原 private RPC 內部依 membership 授權，並由 postgres definer 追加資料。因此單純將 authenticated 或 RPC 授給直連 LOGIN 會接受偽造 claims；本設計必須新增受控 definer 才能限定 Fixture A，屬新增安全能力，仍需批准。最大一筆能力基於固定 expected_version=13；其他正常使用者的更新會使 probe PT409 停止，不能自動改版本以繼續。沒有自動還原／刪除合成追加。

## 本地證據與限制

`test.mjs` 用現有 PGlite，只跑新增 probe 邊界測試；8 組通過。auth.uid 的 coalesce legacy／JSON 定義已與遠端唯讀定義核對。測試覆蓋 PUBLIC／其他角色拒絕、無參數、偽造兩種 claims、原 RPC／表／DDL／SET ROLE 拒絕、固定租戶、rollback、最多一筆 commit、硬截止、角色屬性目錄、啟用目錄與精確清理。PGlite 的 session_user 來自 SET SESSION AUTHORIZATION 模擬，不能宣稱真實密碼登入、連線數／到期 enforcement 或雙後端重疊。

本機另確實裝有 PATH 外的 PostgreSQL 14.19 server。`native_overlap.py` 只嘗試独立 `/private/tmp`、0700 Unix socket、無 TCP listener 的合成 cluster，未碰既有 daemon。既有 Homebrew keg 缺編譯期 `/opt/homebrew/share/postgresql@14/timezonesets` 資源路徑；使用既有 libraries／share 與任務暫存 runtime 仍無法啟動。暫存檔已清除，沒有留下 server。未修改全域 symlink、安裝／升級或開服務；native 與遠端重疊均 **未 PASS**。後續修復全域安裝超出本輪授權，不自行執行。

即使之後本地原生重疊成功，它也只證明合成 schema／RLS／RPC 的鎖等待與 rollback；不能代替遠端 deployed SHA、Supabase session pooler、真實 Auth／自然 JWT 到期的證據。
