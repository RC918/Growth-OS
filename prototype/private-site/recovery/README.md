# 單站候選的一致性恢復（離線）

從 PR26 `f08c30d748bf73bbf9ab96496f428fa23bc12abb`，補此前只有 publisher journal 的恢復缺口。此包只處理目前三頁候選的已知資料形狀；不是任意 WordPress 外掛／多站備份平台，也沒有 hosted 執行入口。

```sh
node --test prototype/private-site/recovery/contract.test.mjs
node prototype/private-site/recovery/native-regression.mjs --mode growth-os-private-recovery-regression
```

本機 Chromium 可明確設定 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`。所有資料是新建、短命、label 綁定的本機 native WP/MariaDB/PostgreSQL/GoTrue/PostgREST fixtures；無 hosted Supabase／Owner 登入／RC artifact。

## 同一停止寫入點

先完成 URL scanner→Save→logout→fresh native session→Review→WP Publish/Restore。故意丟失已提交回應，使原 operation 成為 unknown；備份 gate 拒絕它，原 operation 僅 GET 核對，WP 寫入總數保持兩次。

關閉 browser context、gateway，等待 scanner 子程序與 publisher SIGTERM 退出；撤銷短命 WP App Password，停止 native Auth/PostgREST，關閉四支 Save/Review EXECUTE，最後 停止 WP 全部 Apache processes。MariaDB 同時設 read_only=1。只有本機 fixture 的 DBA export reader 尚存，沒有應用 writer。以 UUID／UTC cut 時間、org、version、page、operation／state／observation 綁定同一 checkpoint；直到擷取全部資料才移除原服務。

`archive.mjs` 寫出 0700 owner directory、0600 regular single-link files，fsync 後交 manifest SHA256。還原要求從受信任交付取得 digest；hash 不是簽章，也不能抵抗可同時替換可信 receipt 的管理員。

| component | 備份與恢復 |
|---|---|
| wordpress-files | 停止 Apache 後由同容器 mount namespace 的獨立 tar reader 讀取四個固定 theme/plugin 檔與 PNG uploads；記 path/mode/uid/gid/SHA256。image-provided core 與 inactive files 依 pinned image／fixture 重建。拒絕連結／路徑穿越／不支援 uploads。恢復後檔案資料及 metadata 全等。 |
| mariadb | 無 writer 時，以一個 READ ONLY／WITH CONSISTENT SNAPSHOT transaction 擷取九個完整內容表（含 posts/revisions/postmeta）及明列允許的 options、鎖定 users、最小 usermeta。新 isolated DB transaction 匯入，逐列重新擷取核對。不是含 Auth secret 的原始全庫 dump。 |
| scanner-sqlite | scanner 已退出，以 Python sqlite3 backup API 產生新檔，integrity_check、foreign_key_check、schema/user_version、snapshot ID/fingerprint/payload 及全部 rows 核對。目標不啟動 scanner writer。 |
| publisher-journal | 既有 openStore.backup / restoreBackup；原 binding/sequence/checksum，new readonly store，保留 source snapshot，僅 history／measurement。unknown/submitting/diverged 直接阻擋 cut。 |
| native-business | 額外保存新候選14表、schema exact manifest、pinned images、default ACL／ensure_rls 與 synthetic UUID 身分連結。全新 native GoTrue admin API 以相同 UUID、全新隨機 credentials 建身份，再 transaction 匯入14表。不是備份／恢復 Auth session 或真專案。 |

WP options 允許清單見 `wp-fixture.mjs`。其他 options/usermeta 不假裝已恢復；任意插件或密碼保護文章不在支持範圍。candidate PNG upload 是本輪新生成像素，沒有讀取既有 RC bytes。

## Secrets 與關閉狀態

不打包 wp-config、env、TLS keys、DB/JWT secrets、password hashes、activation keys、session_tokens、App Passwords、native Auth sessions/refresh/password bytes。WP users 使用無法登入的 password marker，read/write expiry 強制0；保留 `growth_pilot_attempts=2`，不重設配額。new native target 使用新 JWT secret，舊 access/refresh 拒絕。業務 writer ACL 維持關閉，publisher 無 read/write grant；history 使用新 native 身分與 membership，並不重新授權 WP。

recovery read-only gateway 是隔離 fixture adapter：關閉 Save/Review UI 與 source／mutation routes，僅讀既有資料。不是宣稱現行部署 gateway 已具生產恢復模式。部署前需單獨核定原生身份恢復、DB/WP/TLS credentials 的安全 reprovision、目標配置、加密／key custody／保留政策、服務啟動與破壞性恢復 approval。

## 拒絕與證據

缺件、hash mismatch、混合 checkpoint（即使重新計算單件 hash）、非私有檔案、symlink、已存在 target 都在創建 restore resource 前拒絕。crash `writer.lock` 不自動刪除；本輪在原 store 留鎖，目標只讀恢復完成後仍確認 bytes 相同。只清除此 run 自有短命資源；不以刪原 snapshot／提高上限換取成功。

原 WP/MariaDB/native services、scanner/publisher 全退出後才建立獨立 target；1280/390 fresh context／native login 讀回原 version/payload、Review/audit、journal history、三頁 raw/metadata/control、量測未知而非零。viewer/foreign 拒絕、closed writer 拒絕、target publisher 零 WP requests。備份與 manifest 留在 `/tmp/growth-recovery-*-backup`，CI artifact 保留3日僅為工程證據，不是部署 backup retention 承諾。

SQLite API 依 [Python 官方文件](https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup)。完整逐點驗證與限制見 `docs/Private_Site_Recovery_驗證_2026-10-06.md`。RPO/RTO、排程、費用、remote restore、磁碟／SSH／DNS／防火牆／mail 均未授權、未執行。
