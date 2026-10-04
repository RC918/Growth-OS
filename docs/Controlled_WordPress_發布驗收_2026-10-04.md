# ② 受控 WordPress 單平台發布驗收

基準 `f9f5f47df517208cd216cb8ea95d7a81044f550a`／PR #19。父確認① `0fcbc50c103fa377b58f0371faa8cf72b8a05226` 經 Reviewer `01a107ea-a4e4` APPROVE；治理文件經 Reviewer `01a107f4-d9f2` APPROVE，CI `37220142034`／Preview `JDjznRrYHv2cPYxh9hxQcTDtnZZv` success。Dot 指派本 Core；本增量完成後仍必交既有 Reviewer，Primary 不宣告最終驗收。

## 範圍與實際路徑

復用①唯一 unattended entry，加 `--wordpress`：URL fixture → 原 first-result UI 三欄編輯／正常 popup handoff → 原 Save → logout／fresh context/token → 原 exact-version Review → WordPress 現況／差異 → **獨立發布確認** → 真 WordPress HTTPS REST 寫入 → authenticated API＋HTML 核對 → 發布證據保存 → logout／fresh context/token → UI 讀回同版發布紀錄 → 確認恢復已核對基線。

- `apps/web/wordpress-publication.mjs` 為同版本旁的單平台 UI。新設定預設 false；原 runtime Save／Review disabled 不變。啟用時取代唯讀發布預覽，不同時顯示矛盾狀態。三欄純文字、目標頁、版本及時間在一般畫面，詳細 binding／API／HTML 證據在展開紀錄。
- `prototype/wordpress-publish/publisher.mjs` 是**尚未部署**的單平台 server adapter。runner 截取同源 `/api/wordpress-publication/*`，由實際 adapter 執行 WordPress HTTPS；不是以假成功回應替代 WordPress。沒有部署此 endpoint、外部 site grant 或通用 CMS framework。瀏覽器只持原 synthetic workspace session；WordPress 密碼只在 runner 記憶體。
- adapter 每次由既有 `createWorkspaceApi` 的 authenticated／tenant 讀取重建 authoritative version，再使用 `previewUrlPublication` 核 source、latest、exact Review 與候選 URL；不信任 browser 傳入內容。送出前再次核對版本與 WordPress baseline revision。fixture 的來源 URL／citation URL 指向本次受控頁，來源 bytes 仍是①固定合成 HTML；**不是 live URL 擷取或真站內容理解證據**。WordPress 現況另以實際 GET 核對，不拿合成來源快照充當現況。
- title → `page.title`；description → escaped plain-text `<p>` 的 `page.content`；meta description → 註冊 `growth_meta_description` REST meta，由最小 MU plugin 輸出真 `<meta name="description">`。沒有把 excerpt 當 SEO meta。最小 fixture theme 輸出 WordPress title/head/content 及 page ID，沒有第三方插件／主題下載。
- 每筆證據綁 org、version、review、source/content/version digests、page ID／URL、before/after revision。`first_published_at` 取 WordPress `date_gmt`（測試資料固定 2026-01-01，不冒稱本次發布時間）；`modified_at` 取本次 `modified_gmt`；`observed_at` 為讀回觀察時間。無流量／成效宣稱。

## 隔離資源、來源與清理

只使用 executor 既有 Docker bridge；未新增 host network、DNS、trust store 或公開 listener。DB 僅聽共享容器 namespace 的 loopback；Apache host mapping 與 Node TLS proxy 只 bind `127.0.0.1`。DB 與 WP data 在各自 tmpfs；HTTP 僅為本機 TLS proxy 到本機 Apache 的內部 hop。測試 client 額外信任該 run 的短期憑證；**無 CA 時實測拒絕 self-signed certificate**，沒有 `ignoreHTTPSErrors`、`rejectUnauthorized:false` 或跳過瀏覽器警告。

官方 Docker Hub `library/wordpress`／`library/mariadb`，固定而非追 latest：

| 元件 | 精確版本與 digest |
|---|---|
| WordPress／PHP Apache image | `wordpress:6.8.3-php8.3-apache@sha256:30bff39330d1693b0ce13d32fc9b7bb67193064f040b7d60d3494e136fa599d4` |
| MariaDB image | `mariadb:11.4.8@sha256:bc474f00629f0123c10f9e1bca193a45d18af15a274cf0656acda64f1086c3b6` |

官方映像來源可由 [official-images WordPress manifest](https://github.com/docker-library/official-images/blob/master/library/wordpress)／[MariaDB manifest](https://github.com/docker-library/official-images/blob/master/library/mariadb) 核對；runner `--pull=never`，下載是入口外明列的官方 digest pull。實際 runtime 核 WordPress 6.8.3、MariaDB 11.4.8。

- 每 run 隨機容器名稱／label、DB 密碼、setup／publisher 密碼與原生 Application Password；lease 最長 900 秒，只允許一個固定 page 的 GET／POST 三欄。Application Password **本身不具 page scope**；fixture 另以 capability＋REST route／field allowlist／expiry 收斂。setup 帳號無可帶出的密碼或 App Password；DB 不開 host port。
- 原生 Application Password 到期與撤銷均實測：expiry GET 403；native revoke 後 GET 401，page 無變化。`finally` 只刪該 run 建立的 WP／DB containers、tmpfs 內容、0700 暫存目錄下的 env／TLS key；不 prune、不刪其他資源。共享官方 image cache 保留，無憑證或資料在 image 中。
- `/tmp/growth-wp-<run>-evidence/` 只留無 secret 的 JSONL、每尺寸 proof JSON 與 screenshot；CI 上傳同一證據包，保留 3 天。資料都是 synthetic。無付費、雲端站點、外部帳號、OAuth、Owner 既有網站或跨 run grant。

## 問題／失敗與恢復契約

獨立確認綁 server-issued intent 與 page ID；開始提交先記 submitting，該 intent 永不再送。提交前 transport failure 與提交後 response lost 都先記 unknown；只用 GET 判定已套用／未套用／現況分歧。前者實測 0 WordPress POST；後者實際 commit 後丟棄回應，再 GET 核對，沒有第二 POST。新版、未確認、viewer／foreign、錯頁、額外欄位、過期授權拒絕。

恢復是另一個明確 UI 動作：必須先有 API＋HTML 已核對發布，且現在 revision／三欄／非目標欄位仍等於已核對 after，才提交保存的 before 三欄；之後 GET 核回 baseline。現況分歧停止 mutation。WordPress 原生修改時間／內部 revisions 可更新，不能謊稱整庫 bit-for-bit rollback。對照頁完整 row、page 非目標欄位與 meta 值保留。

本輪必要修正：CSP 缺同源 API（P1，本路徑阻塞）；server fixture 未 JSON 序列化日期造成版本誤判（P1，重用真 HTTP 邊界）；雙 viewport 共用證據目錄需容許同 run 重入（必要 P2）。均修最小原因後從受影響入口到 VERIFY 重驗，未擴無關 maintenance。setup 初次 syntax／WP_INSTALLING 初始化問題亦已在 disposable smoke 中修正並驗清理。

## Agentic Verification Loop 與證據

| 驗證點 | 適用性／結果 |
|---|---|
| PLAN | 適用：僅②受控站單平台最小發布；上方資源／授權／清理界線 |
| CODE | 適用：既有版本 UI＋server adapter＋最小 meta plugin；無新 Supabase schema／hosted writer |
| UNIT / CONTRACT TEST | 適用：24 tests 通過（workspace API 14、原發布 preview 5、新 adapter／UI 5），包含未知結果不可重送、漂移不可恢復、late session 不回填 |
| BUILD / RUN | 適用：真 pinned WP／DB、PHP plugin、Node adapter／static modules 執行；repo 無產品 bundle build，以實際入口為證，不拿 Preview echo 代替 |
| BROWSER / DOM CHECK | 適用：實際 Chromium UI；文字 escaping、確認 gate、HTML title/meta/body/page ID 核對；JS errors／overflow 為零 |
| DESKTOP + MOBILE E2E | 適用：1280／390 各完整①→②；各 4 次 WP 寫入＝2 publish＋2 restore，失聯 readback 零重送；screenshots／JSON proof |
| DATABASE / AUTH CHECK | 適用：沿用 authenticated PGlite＋原 PG17 六案；真 WP Application Password＋page/field/expiry scopes；TLS 驗證開啟 |
| SAVE | 適用：①既有 Save／Review＋本 run 發布 journal；未新增 hosted Save／Review |
| LOGOUT | 適用：既有 UI sign-out；僅清頁面 memory，不宣稱真 Auth server revoke |
| FRESH SESSION | 適用：關閉舊 context／全部分頁，新 context／token，空 cookies/storage |
| LOGIN | 適用：既有 isolated synthetic Auth mapping；真 workspace Auth／JWT issuance／OTP／2FA **未驗** |
| READBACK | 適用：fresh session UI 讀回 exact publication evidence，與 journal／原 API＋HTML 證據一致；不自動發布 |
| TENANT / PERMISSION CHECK | 適用：viewer／foreign denied；原 SQL 四 403、零拒絕增量保留；WP wrong page／extra field 403、stale baseline 409、expired 403／revoked 401；新版後舊 intent 發布與 preview 均拒絕 |
| VERIFY | 本機完整入口通過；每次還原後 baseline 三欄、對照頁／非目標欄位／meta 一致；發布段 SQL 全 public rows 不變。新 HEAD CI／Preview 另核，交既有 Reviewer，未自行 APPROVE |

重現（映像需先按上表明確 pull；無其他下載）：

```sh
node --test prototype/wordpress-publish/publisher.test.mjs prototype/owner-workspace/workspace-api.test.mjs prototype/owner-workspace/url-publish-preview.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --wordpress
```

CI 使用相同入口、原 Playwright 安裝及既有其餘驗證，新增 pinned image pull／證據 artifact；無新 workflow/task。原①完整 core 與安全負測保留，並不是另造登入 harness。

## 限制與完整 Technical Debt

| 項目／位置 | 嚴重度、影響及延後處置 |
|---|---|
| WP 多 writer 競態：`site-plugin.php` baseline hash 檢查與原生寫入不是跨系統 transaction；adapter 只串行本 runner | P3（此隔離 milestone）：受控站只有本 run publisher，無其他 writer，因此本 slice 不受阻。尚未證明 production concurrent writer／crash-restart exactly-once；不宣稱具備。暫不開 external／hosted grant；進真站前須設計 atomic precondition／operation reconciliation。發現於本 Core（基準 f9f5f47），證據為原生 WP endpoint＋串行 runner 的測試範圍。追蹤者待 Dot 指派。 |
| grant／證據生命週期：`site.mjs`、`publisher.mjs` | P3：只有短命 run-local grant 與 journal／CI artifact，無跨 run grant、server restart replay／durable product publication store。當前只需 executor 控制站，已驗 fresh browser session，因此不阻塞；正式站接入／持久量測前再處理。保留 disabled 預設並如實標 isolated；發現於本 Core，證據為 cleanup／fresh-session／artifact。追蹤者待 Dot 指派。 |
| 真站品質、流量與 Measure | 未實作後續 Core，非本次故障；流量 unknown、不宣稱因果。依 Dot 後續選題，不在②擴張③／Owner 自有站／外部商家。 |

遵守 [WordPress Application Password authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)、[Pages API](https://developer.wordpress.org/rest-api/reference/pages/) 及 [REST meta registration](https://developer.wordpress.org/rest-api/extending-the-rest-api/modifying-responses/) 的各自邊界，未將平台一般能力誤報為本程式已驗證保證。

runtime disabled SHA256 `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`（兩份）；persistent frozen index `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351` 不變。hosted DB history 27 維持父既有已核狀態，本次未呼叫 hosted DB 查寫或改 Auth；無 hosted restore/login/Save/Review POST、live URL／模型／費用。
