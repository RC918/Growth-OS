# 私有站共同 checkpoint／隔離恢復驗證

本輪只接續已審 PR26 `f08c30d748bf73bbf9ab96496f428fa23bc12abb`，branch `feat/private-site-recovery`，stacked base `feat/private-site-theme`。結果為四個實際 store 加 native synthetic 身分連結的一致性恢復候選；未部署，也不是任意 WordPress 全站備份平台。Reviewer 固定 `01a10f3b-3546-72bb-b3d1-4a37140556ea`，Primary 不自行 APPROVE。

## 結果與適用邊界

實作與具體排除清單見 [recovery README](../prototype/private-site/recovery/README.md)；原 [planned manifest](../prototype/private-site/theme/recovery-manifest.json) 已接上實作。WP 的九個內容表完整擷取；options/usermeta 只保存明列候選所需欄位，users 密碼與 activation key 不備份，所有會話／App Password 排除。image core／inactive files 重建，四個候選 template/plugin 及本輪 PNG upload 保存 path/mode/uid/gid/bytes/hash。故不能把此結果外推至未登錄 plugins、任意 uploads 或 hosted Auth 完整恢復。

共同 cut 的 application writers 實際停止：原 browser context／gateway 關閉，scanner、publisher、native Auth／PostgREST 退出，四支 SQL writer EXECUTE 關閉；WP 全 Apache PID 以 OS stopped state 核對、MariaDB read_only=1。backup reader 才產出五個同 checkpoint 組件。所有原服務結束後建立新的 isolated target，無舊 auth stack 依賴。測試 driver／browser engine 本身仍執行，但 target 用全新 context／native GoTrue session，沒有重用舊 storage/token。

## Agentic Verification Loop

| 驗證點 | 適用性／證據 |
|---|---|
| PLAN／CODE | 適用；由 journal-only 擴至已知候選四 store＋14表/UUID native linkage。固定 components，未知 pending 操作拒絕，不自動 replay。 |
| UNIT／CONTRACT | 適用；recovery 3案、schema/theme 3案，涵蓋缺件/hash/mixed-cut、private mode/symlink/既有 target、pending/crashlock、真 SQLite 獨立備份與損毀拒絕。 |
| BUILD／RUN | 適用；Node orchestrator、實際 Python sqlite3 backup、native Docker WP/MariaDB/GoTrue/PostgREST/PG；JS syntax及實際命令通過。Vercel static build 不當作 PHP/DB恢復證據。 |
| BROWSER／DOM | 適用；Product 單一 scope、三頁 title/meta、控制頁 HTML/hash/raw/meta、鍵盤 skip/history與無水平溢出。 |
| DESKTOP／MOBILE E2E | 適用；1280／390 各自新建 source/target，URL→來源成果→Save→Review→Publish/restore→共同 cut→fresh target history/measure。 |
| DB／AUTH | 適用；兩邊原生 Auth migration 70、業務14表等值、RLS/ACL 24 functions、default ACL/ensure_rls exact；target writer closed，舊 JWT/refresh 拒絕。無 hosted／Owner Auth。 |
| SAVE→LOGOUT→FRESH→LOGIN→READBACK | 適用；source native Save/Review exact，真 logout/revoked refresh；source services 清除後 target native 新 credential/session，exact payload/version/review/audit/history。 |
| TENANT／PERMISSION | 適用；viewer 可讀版本但不可 publisher history；foreign 無版本；Save RPC、publish/restore/readback 拒絕；目標無 scanner process、無 WP grant，publisher WP呼叫0。 |
| VERIFY／交審 | exact HEAD/CI/Preview/artifact digest 以 PR 交付 receipt 為準；既有 Reviewer 裁決，非 Primary 自行驗收。 |

## 可反駁的關鍵主張

1. Source unknown 真實來自丟失已提交 WP 回應；在原 store 上的備份 gate 拒絕，原 operation 只 GET reconcile。總共1 publish＋1 restore，attempt=2，未重送或清配額。
2. 檔案讀取不是 `docker cp` 的假成功：此執行環境對 tmpfs 僅看見底層空目錄，缺檔 gate 先攔住；改用同 mount namespace 的獨立 tar reader，在全部 Apache stopped 時擷取。Docker 對 PID1 發 SIGSTOP、容器內對 worker 發 SIGSTOP，讀 `/proc` 核 stopped，MariaDB只讀交易。
3. SQLite 保留真 scanner 的 snapshot ID／fingerprint／全部 payload/rows；缺檔不合成。Native target 建立前 source服務已退出；target初始DB不同，匯入後按表、檔案和頁面重新讀取全等。
4. Hash-mismatch／mixed-cut 即使修改單件 hash 仍拒絕，未建立對應 target；來源 archive 不變。來源 crashlock 原 bytes 保留，僅新 readonly journal 存在可讀歷史，不刪 lock 解鎖。
5. 沒有備份 native passwords/JWT/secrets/refresh，沒有恢復 WP password hashes/App Passwords/session；targetWP password marker不可登入、expiry=0；新nativeJWTsecret使舊JWT拒絕。目標只讀 fixture gateway 不開 scanner/Save/Review/mutation。

## 必要修正與保留事項

測試中的 Review checkbox 會在 native只讀probe完成前 disabled；過早 focus＋Space會收起 details。以明確 enabled readiness gate 修正測試，不改產品互動或加 sleep。MariaDB允許清單字串的 collation comparison 已固定；原始 failed runs 不冒稱 PASS，最後一致性完整 run 才交付。

保留 P3：既有共同 loopback IP limiter、上游 CI Action Node20 相容提醒、主機容量/真正部署啟停、backup encryption/key custody/retention/RPO/RTO 尚未驗。位置/基準沿 PR24–26 debt；此輪未擴修，不阻擋離線候選，部署 preflight 或真 workload 到來再由 Dot 指派。無獨立必要 Core 自動續開；等 Owner 整體部署批准。

未做 AWS/Supabase/Cloudflare/Brevo/Zoho/SSH/DNS/firewall 寫入、真磁碟格式化、長期 grant、Owner login、真 URL/model/新費用。沒有改 frozen RC bytes/舊worktree，也沒有增加 AGENTS 治理文字。此次重入失誤觸發點是尚未讀 AGENTS 就誤採 thread 原初始化；最新 base gate 已核當前 recovery branch，沒有更高層強制舊分支規則。

本機 evidence、截圖與 hashes：見 `docs/evidence/Private_Site_Recovery_2026-10-06/`。CI完整backup原件屬新 synthetic資料，傳輸解壓權限不等同來源filesystem；使用前須在批准的私有 staging directory 恢復0700/0600再核可信digest，不能放寬 verifier。

## 本機最後驗證 receipt

`growth-recovery-ecd9f368-36f8-4977-a182-f25d2565441f`，2026-10-06T04:08:57.276Z，TCP readiness修正後1280／390全部 PASS。先前6個 recovery/schema/theme contracts、12個 gateway/RC/frozen contracts PASS仍適用；新CI按新HEAD完整執行。

- 1280：checkpoint `adffabb3-2e38-4db3-a14d-dbff241e0456`，manifest SHA256 `4d0d1b9a009df338263247d2c14d970531b3687687e5a71ddcdb016b888a78e3`；source WP POST=2，target publisher WP calls=0，attempt=2。
- 390：checkpoint `ba2ee716-87c5-4289-84f4-1a950683aed8`，manifest SHA256 `1c02b332dd68ed941ed6d2dfd2612b2d44fbf4ed8542e465818a0255759493d8`；source WP POST=2，target publisher WP calls=0，attempt=2。

12個 evidence payloads（含sources.json）與SHA256SUMS；source hashes19項。

## CI readiness 必要 P2 修正

首個 HEAD `847949f40f4e30a4b89be5f503c784160634e9e4` 的 run `37411065614`／job `112099392002`，第62步在 native PG roles 安裝前失敗，未執行後續 mutation。新 fixture 使用 Unix socket pg_isready，誤採官方 image entrypoint 初始化期間的短命 server；實際 pinned entrypoint 顯示臨時 server 以 `listen_addresses=''` 啟動後關閉。改成與既有 runner 相同的 `pg_isready -h 127.0.0.1`，只在正式 TCP server ready 後安裝 roles，不 retry mutation。修正後重新從 native啟動跑完整 desktop/mobile迴圈；最終 CI 以新 HEAD receipt 為準。
