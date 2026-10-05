# 完整內部 RC 候選與待批准執行 envelope

基準 `753dd9c47655e961221a1ef6be9bf8a9aef7194c` 已由 Reviewer `01a10857-2c6c` APPROVE；CI `37226680267` 59步、Preview `H6gCsEbPeZw3TMUoJ7xnbfUETxpX` success。父本輪指定收斂完整 RC，沒有授權真持續環境執行。本文件及 `prototype/internal-rc/` 是新候選，沒有修改歷史 frozen 包，也不因名稱 RC 自動取得新權限。

## 2026-10-05 第三次 RC 已清理／必要 P2 摘要核對修正

第三次批准 reference `Sentinel_a9f8eece7a308191be4ea6862d4f054e`、HEAD `fae2fdf0393cbec7388dc2e4cdd9087dd0544322`、110項digest `5cb5af95a6f1db4b75c86f9f5a53866cf1e21415c00d1b1a500e0997a51be8af`，窗口03:48:46–05:48:00 UTC。03:51:54.342Z唯一provision開始；native GoTrue自身70migration、3users/2org、實際controlled HTML→UI編輯→native JWT/HTTP SQL Save→UI signOut/新context原生login→exact payload readback/Review已走通，1version/1review/2audit。這裡的signOut仍是page-memory清除，不冒稱native logout撤銷。

03:52:15Z原operation `d96a13bc-3e4c-40c0-a1f0-3e2e25eccaa7`（version `93dace75-3e5c-466d-a1a9-bad51528ed7d`）唯一WP POST200，三target fields已套用；journal為`preview→submitting→state_diverged`，03:52:45.397Z phase A exit1。原journal**保持失敗，不追認成功**。原比較的15個保留欄位中只有excerpt.rendered不同；raw均空、protected均false，rendered從`<p>Steel bolt for workshop assembly.</p>\n`變成新正文衍生值。API其他差異為已批准title/content/meta、modified時間、generated_slug、revision hash與revision links，實際slug未變。不把整個API response說成只有excerpt差異。

只GET原page核對，沒有重送、restore或phase B。量測保存、第三提交故障注入、全runner退出後B讀回及完整tenant矩陣NOT_RUN。control1002當時僅失敗後id/title/content/slug/status符合setup預期，modified有觀察值；**沒有獨立發布前完整snapshot，不能稱完整bytes不變**。當時wire POST body未保存，keys由固定程式/plugin限制推導；access log只能證一次page1001 POST200。

03:55:36.027672Z cleanup exit0，03:56:08.290144Z postflight無root/data/secrets/grant/own容器network，ports可用；三個消耗marker均保留。原allowlist `/workspace/shared/growth-internal-rc-evidence-20261005-attempt3` 保留至2026-10-08T05:48Z。兩份原bytes最小歸檔供跨executor審查：

- [failure-summary.json](evidence/RC_Attempt3_2026-10-05/failure-summary.json)，SHA256 `0ca8ae782f9dc421a8ca8ae0908dd6644cbfb1064408788970ffaf097fff00e1`。
- [cleanup.json](evidence/RC_Attempt3_2026-10-05/cleanup.json)，SHA256 `980207fe3472680e59a930c552181d487b1a199084ee5cc79e64eedd83b73063`。

### 根因與最小新候選

Reviewer01a10a36裁必要P2；父授權修同一發布核對Core。舊短命WP fixture明填`post_excerpt`，持久RC留空，所以舊regression未覆蓋WP自動摘要。現保留全部原untouched欄位與型別檢查；excerpt必須完整`raw:string/rendered:string/protected:boolean`且無額外欄位。**僅raw精確空字串且protected=false**忽略rendered相等性，仍留原/新rendered證據。明確摘要（含空白字串）及protected情形保持rendered嚴格比較；raw/protected/其他保留欄位drift、缺值／型別異常failclosed。沒有泛化generated欄位豁免。

三target fields／page identity／HTML全核對才確認發布；restore同樣核API三欄、保留欄位及HTML，失敗保持restore_unknown，讀回失敗不能先變restored而解鎖新提交。發布evidence保留`excerpt_readback`，restore另存`restore_excerpt_readback`，不改原發布證據。Cold journal保留完整baseline校驗；原unknown只GET、不重發限制不變。

短命fixture改用**同一RC theme.php**與固定page1001/control1002，sourceFixture預設空摘要，另保留真WP明確摘要case。原pinned WP6.8.3/MariaDB11.4.8、tmpfs、loopback與client-local TLS、run-only原900秒grant不變；不觸碰持久RC root/window。HTTP接收端新增僅keys觀察（不存body/header/credential）；control記錄完整post欄位（password只記protected布林）及全meta，publish/restore前後完全比較。新候選operator存control-before，A/B存並核對control-after；**這些新候選持久路徑尚未部署**。

### Verification Loop／界線

PLAN/CODE：同Core必要P2，maintenance=0。UNIT/CONTRACT：22tests含空/明確摘要、raw/protected/所有保留欄位drift、缺失/型別、錯target/HTML、restore HTML unknown維持closed與原journal/RC契約。BUILD/RUN：`excerpt-regression.mjs --mode growth-os-isolated-regression`真WP兩情形各2POST，實際commit後丟reply/SIGKILL→新PID→原ID GET-only→API/HTML確認→restore；前後excerpt、receiver keys、control完整page/meta保存到`/tmp/growth-wp-*-evidence/excerpt-proof.json`。負測另對真WP GET回應注入raw/protected/缺失/型別/slug/explicit-rendered drift而拒restore、POST無增量；這是transport fault injection，不謊稱WP原資料遭額外改寫。

BROWSER/DOM、1280/390：原單一入口沿controlled HTML、synthetic Auth/session與隔離SQL，驗Save/Review→發布/恢復→fresh session→publication/measurement readback、before/after SIGKILL原ID GET-only、tenant拒絕及零拒絕案SQL/audit增量；新control全row/meta證據並存。DATABASE/AUTH：原SQL／RLS路徑沿用，沒有Auth改動；本輪WP回歸不宣稱native Auth/產品OTP或持久A/B。VERIFY：exactHEAD CI/Preview/原JSON與新artifact交既有Reviewer。第三次完整RC仍FAIL，三個provision已消耗；任何第四次完整持久RC均需新包、新窗口、新批准，不用05:48前剩餘時間重跑。

## 2026-10-05 短命原生 HTTP/JWT 整合（已驗，仍非持久 RC）

Reviewer01a109d7對0b8c46c判必要P2：SQL harness寫ledger、插user、手设claims不能證明native executable交接。父已依既有日常synthetic regression授權本節最小原生整合；不是第三次持續RC，也不沿用兩個已消耗窗口。下方0b8c46c歷史段落的runtime未驗／待授權說明，以本節新實證更新；持久A/B與產品email/OTP仍未驗。

**唯一入口**：`node prototype/internal-rc/native-http-regression.mjs --mode growth-os-native-regression`；缺mode／production mode在任何資源或憑證生成前拒絕。原pinned PG17.6、GoTrue v2.196.0與PostgREST v14.17；專用unique run labels與Docker internal network，只允許該run三容器連線，**無host ports、無WP**。PG資料與socket tmpfs，Auth/REST read-only及/tmp tmpfs，無host bind data、沒有持續root或marker。600秒測試上限，finally按名稱與owner label只清該run容器/network。

候選和fixture共用純函式`nativeServiceEnv`，沿原db／jwt生成格式、role／aud／300秒設定、db alias、closed signup及loopback logical callback設定；只是把原operator三個env模板抽出，內容未改。fixture透過Docker子程序環境傳值，命令列只含環境變數名稱，不寫env／token檔、不打印secret。HTTP僅可指向該run經ownership與internal network核對的容器IP，服務無外部egress。兩次前置fixture失敗分別為Node socket stdin不能由Docker env-file開啟，以及internal network不發布host ports；均在驗收前清理，非敏感probe釐清後改受控child env與internal IP；不是安全拒絕或持久RC重試。

**真正啟動交接**：原roles.sql/bootstrap→GoTrue executable自身migration→health＋auth-ready.sql owner／最小role gate→原生admin API建立三個synthetic users→原生password grant→候選原business SQL→PostgREST NOTIFY schema reload→HTTP流程。此入口不匯入migration replay、不SQL插Auth身份／ledger、不SET ROLE／手設JWT claims。SQL只用批准的bootstrap/business候選及只讀狀態／計數；樣本payload仍來自原非敏感HTML fixture，不外呼live URL。

### 本機原始實證與HTTP結果

最終run `growth-native-http-34967e66-9e56-4e36-8ba2-42c8e497cc57`：02:25:53.127Z開始、02:25:59.872Z完成清理，result PASS。[原始非敏感JSON](evidence/Native_HTTP_2026-10-05.json) SHA256 `80fe2a526e74e9c8a6faa304f3a458bda283a23461e354bafd1c1784aaf58e61`。無token/password/env；CI同入口另保留native-http-evidence最多3天。先前兩次持久失敗JSON/SHA保持原樣，不被本次PASS覆蓋。

| 核對 | 實際結果 |
|---|---|
| Native migration／role | GoTrue自身建立70筆migration ledger；uid owner=auth admin；5個應用角色superuser/createdb/createrole/bypassrls數0。 |
| 身份／JWT | 三個native admin create皆200；owner兩次＋viewer/foreign各一次password grant皆200；原樣返回JWT由native GET user與PostgREST驗證，另核HS256 signature／sub／role authenticated／aud authenticated／exp-iat≤300。未用harness簽的user session；admin bootstrap token只用於native admin API。 |
| Schema reload | business表尚未存在時HTTP404；原候選SQL提交及NOTIFY後，GET變200，未手動建立cache或改claims。 |
| Save／Review | HTTP Save200，exact完整payload讀回200；exact source/content/version digests Review200，精確Review row讀回200。最終1version/1review/2business audit。 |
| Logout／fresh login | 原生logout204；舊refresh token400；丟棄原session後重新password grant200，新JWT不同，native GET user200，version全row與Review全row讀回完全一致。這是native HTTP session，不是browser/callback/emailOTP驗收。 |
| 簽章／tenant | 改JWT signature之GET/Save均401；viewer OrgA GET200/1row、foreign GET200/0row（RLS隱藏，不誤稱HTTP403）；兩者Save與Review皆403。 |
| 已失效身份 | native admin刪foreign測試身份200，GET user403；原token對自己的OrgB從1row變0row，Save/Review403；不是SQL假造失效。native Auth刪除引發membership FK cascade屬測試setup，不混入拒絕案零增量。 |
| 拒絕案資料 | 比較versions/reviews/business audit完整snapshot前後bytes一致，拒絕案增量0。Auth自己的login/logout/audit/session變化不冒稱0。 |
| 清理 | 每項先核本run label；container/network列表皆空、tmpfs資料與憑證隨容器銷毀、無env/token檔；持久RC root仍不存在、兩個舊marker bytes不變。 |

**重要界線**：native logout證明refresh session失效；不宣稱stateless access JWT立即失效。產品`signOut`仍只是既有page-memory清除，這次没有修改原Auth/UI/RLS。已刪身份的資料讀寫由現行membership/RLS及native GET user拒絕，沒有加繞過或放寬權限。短命原生PASS只涵蓋同run服務／JWT／HTTP／SQL整合；不外推整個runner退出後的持久A/B、跨run秘密、WP平台grant或產品emailOTP。

### Verification Loop

PLAN/CODE：只補Reviewer必要P2之native交接證據，共用候選env避免兩份配置漂移，maintenance=0。UNIT/CONTRACT：10/10 PASS，保留70 SQL相容性與UID/secret邊界，再加explicit test-only gate與候選env共用檢查。BUILD/RUN、DATABASE/AUTH、HTTP SAVE→REVIEW→LOGOUT→fresh LOGIN→READBACK、TENANT：以上真native流程PASS。BROWSER/DOM及1280/390：本輪不改UI，CI沿原全部synthetic E2E驗回歸，不能宣稱native browser或Owner email登入通過。VERIFY：同HEAD CI/Preview與原生HTTP artifact交既有Reviewer；父再決定完整持久RC精確新包，沒有新批准不部署。CoreMilestoneProgress=1（真native HTTP/JWT子閉環首次成立），持久RC完成進度仍未驗收。

## 2026-10-05 第二次啟動 RCA 與原生相容性候選（未再部署）

本輪基準 `c82b88c46ce8af50e4e032ef395a135720abebeb`，105項digest `9c6bc1e3aef9ba787ba97fe41f5e183ec0f32cd597669623562fb7682c38991f`。第二次批准reference `Sentinel_1b222cd538648191808264f921960391`、窗口01:44:08–03:44:00 UTC，已消耗且清理；**以下新候選不沿用該批准**。第一次 `.json.started` 與第二次 `/workspace/rc-approved-window-next.json.started` 都保留；文件下方第三次window路徑只是待批准範例，不是新marker／環境已建立。

### 原始可跨 executor 核對證據

以下是父要求附入repo的原始非敏感JSON副本，bytes/SHA與原executor相同；不是Reviewer已獨立觀察該executor的證明。原完整allowlist evidence位於 `/workspace/shared/growth-internal-rc-evidence-20261005-attempt2`，期限2026-10-08T03:44:00Z。

- [auth-bootstrap-summary.json](evidence/RC_Attempt2_2026-10-05/auth-bootstrap-summary.json)，SHA256 `f261c0aba2f8f3debaf33a1173d2ff5e6dbb404ae095125398c11ebf5ed265ff`。
- [cleanup.json](evidence/RC_Attempt2_2026-10-05/cleanup.json)，SHA256 `050403daf770cc5f4b404675013e82ad5f1d64d88393115f4ca68b6b24405b62`。

01:46:03.483Z provision開始；PG bootstrap PASS。01:46:09Z GoTrue `00_init_auth_schema.up.sql`報42501 `must be owner of function uid`，Auth container退出1。01:47:42.535Z記錄phase-A shell exit1、Auth startup FAIL，A acceptance／B／JWT／Save／Review／fresh session／tenant均NOT_RUN；`auth.users`尚不存在，WP publish/restore POST皆0，無WP grant，第三提交未執行。只讀核`auth` schema owner=`supabase_auth_admin`、`auth.uid` owner=`postgres`。

清理前五個exact容器labels均為`growth.rc=growth-internal-rc-01`；原operator cleanup exit0，log最後mtime01:47:47.986Z（不冒充process退出微秒），01:48:21.978Z postflight：唯一root／secrets／own containers/network全部移除、ports8792/8794–8797可用，無有效grant。containers空，network只bridge/host/none。舊標記01:08:39.467Z、新標記01:46:03.483Z均保留；沒有重試、覆寫歷史、重建root或再provision。

### 有界根因與唯一管理責任

兩次具體失敗不同：第一次是host/container UID與0600 bind可讀性；第二次是fixture bootstrap與native migration爭管同一Auth函式。共同驗證缺口是以已預建Auth shim的isolated business SQL測試，外推原生啟動交接成立。此次不以加superuser、轉移一個函式owner或放寬secret modes掩蓋，而檢查完整直接相依鏈。

| 階段 | 唯一責任／本輪變更及證據 |
|---|---|
| PG啟動與角色bootstrap | 保留上一輪stdin→OS postgres999設計及final TCP readiness；roles.sql只建五個最小角色、空auth schema（owner auth admin）、必要usage/search_path/membership，不建auth.uid或任何Auth table/function。所有應用角色nosuperuser/nocreatedb/nocreaterole/nobypassrls；沒有新增role權限。 |
| GoTrue原生migration | 固定v2.196.0 image內70個up SQL逐檔與官方tag相同，按版本序由auth admin執行；第一個建立uid/role、後續升級uid/role/email為JSON claims及jwt，其tables/functions由同一角色管理。production operator不重放測試fixture，也不插Auth users；GoTrue executable自身負責migration ledger／transactions／HTTP啟動。 |
| 原生Auth完成閘門 | Auth health之後、建立三user之前，執行新auth-ready.sql只讀owner／物件存在／應用角色權限检查；缺函式／錯owner或superuser等越權failclosed。不是修改Auth定義或授予權限。 |
| 三user→business schema | 仍由GoTrue admin建立三synthetic users；之後原schema.candidate.sql單交易套用15個business migrations及四份原proposal／stop-write，assert三user存在，再seed兩org/三membership與兩RPC grants。business SQL生成器／候選bytes本輪完全未改，不混入Auth shim。 |
| PostgREST直接依賴 | 固定v14.17以authenticator NOINHERIT連DB，只可SET ROLE anon/authenticated；原JSON claims設定由GoTrue的native uid函式讀取。原PG17.6實驗證此角色切換／schema usage／Save+Review/RLS及pgcrypto可用。新增business提交後GET loopback Data API root readiness，再建立WP短grant；這只驗HTTP就緒，不冒充完整cache/JWT驗收。 |
| WP與短期限 | 維持原setup／單頁／900秒與cutoff cap；只有上游全部就緒後才建立grant。原flags/frozen/hosted/Owner站不變。 |

官方依據：[初始Auth SQL](https://github.com/supabase/auth/blob/v2.196.0/migrations/00_init_auth_schema.up.sql)、[JSON claims函式更新](https://github.com/supabase/auth/blob/v2.196.0/migrations/20220224000811_update_auth_functions.up.sql)、[embedded migration runner](https://github.com/supabase/auth/blob/v2.196.0/cmd/migrate_cmd.go)、[PostgREST v14.17 transaction claims/role](https://github.com/PostgREST/postgrest/blob/v14.17/src/PostgREST/Query/PreQuery.hs)。固定image只用network-none、read-only tar列出SQL，未啟動Auth；SQL原文、逐檔SHA、來源與MIT license隨test-only `auth-migrations.fixture.json`歸檔。不存在未檢查模板：僅Namespace兩種空白形式，測試未知template即拒絕。官方migration無外部extension或額外DB role依賴；用到的gen_random_uuid在PG17內建。GoTrue source核對DB namespace/search_path、先migration再serve、admin固定UUID、HS256 secret／aud／role設定；確認EmailConfirmed synthetic admin流程不需寄信。這些配置／程式碼核對不是runtime PASS。

### Verification Loop 與剩餘盲點

PLAN/CODE：當前完整RC Blocking P2，僅修原生啟動責任與直接相依就緒檢查，maintenance=0。UNIT/CONTRACT、BUILD/RUN、必要DATABASE：本機9/9（RC5＋bootstrap3＋全migration相容1）通過；CI同測試加入既有bootstrap步驟。短命PG17.6、network none、無ports、DB tmpfs；public deterministic sentinel不是新秘密，不建持久身份/session/grant，finally移除容器。原0600不可讀/stdin可讀與秘密不曝露測試保留；精確重現舊uid owner衝突並transaction rollback，修正後以真正DB角色auth admin跑全部70個官方up SQL。測試ledger由harness逐檔記錄，不能當原GoTrue runner已驗；初次replay遇一檔無末尾分號，修正harness語句邊界後通過，未改官方SQL。

全部70個Auth SQL後檢owner、最小roleattrs與空business DB，三個無password/session的SQL-only user fixtures供FK存在；接原business schema後Auth函式定義/ownership hash不變。以authenticator真DB連線、SET LOCAL ROLE authenticated及request.jwt.claims JSON（不注入舊sub GUC），完成exact payload Save、Review、不同連線讀回；viewer讀1/foreign讀0，兩者Save/Review拒絕、零拒絕案data/audit增量，Auth定義仍不變。未加SUPERUSER/CREATEROLE/BYPASSRLS；故意越權role變更於fixture交易中也被新gate拒絕並rollback。

BROWSER/DOM、1280/390、SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK、TENANT產品路徑：本輪未修改UI，既有CI仍跑完整synthetic E2E；本輪新增SQL新連線測試不稱為真登入。原生GoTrue executable啟動／migration runner、admin user creation/password grant/JWT發行、PostgREST簽章／cache reload／HTTP+RLS整合、persistent A完全退出→B獨立啟動 **仍NOT_RUN**。先前失敗本身不因新SQL PASS變成成功。若父要先補短命native service fixture，需要另明確允許固定GoTrue/PostgREST processes及其到專用tmpfs PG的容器連線、public test-only signing material與synthetic ephemeral Auth操作；無持久root/marker、無外部連線/費用、無WP grant。此輪沒有自行擴該權限或啟動服務。

VERIFY：候選工程證據交既有Reviewer，附新HEAD/manifest/CI/Preview；完整RC新增驗收=0，不宣稱RC完成。父再決定精確新包請准，兩次已消耗窗口不復用，不要求Owner登入。

## 2026-10-05 必要 P2 bootstrap 修正與已消耗執行

來源 HEAD `38bc57691fca62e0c1467c88470339a4e2948c5d`，舊103項 digest `e20e7df4f3da5ea6d9acef581293e3c27c85d60293fdc58b78b122b35dfe03ba`。Owner reference `Sentinel_0151b9d0794c81919e2c51cc7db90290` 批准窗口01:02:57–03:02:00 UTC；一次provision已消耗，**不是新候選批准**。不重用、不延展、不刪消耗標記 `/workspace/rc-approved-window.json.started`。下次父在Review後另請一次provision／新固定窗口／新HEAD與digest，使用全新window檔路徑，原root已清理可重建。

- 01:08:39.467Z：獨占消耗標記寫入，provision開始。
- 01:08:52.681157989Z：PG container啟動；01:08:53 UTC完成initdb並到初始化腳本，`psql: error: /docker-entrypoint-initdb.d/01-roles.sql: Permission denied`。PG退出1，Auth/rest均Created、StartedAt零，未執行原生身份建立。
- 01:09:01.459957703Z：phase-A失敗日誌最後寫入（檔案mtime，不冒充更精確process退出時間），shell確認exit1。phase-A acceptance、phase-B、真Auth／Save／Review／fresh session／tenant全部 **NOT_RUN**，publish POST=0、restore POST=0、WP grant未建立。config、identities、wordpress secret、journal及schema.sql均未產生。
- 清理前核五個exact container均有`growth.rc=growth-internal-rc-01`；只按原批准operator cleanup執行。01:09:52.968273548Z清理log最後寫入且exit0，01:10:17.722Z postflight確認root／secrets／資料及own containers/network消失、無有效grant，repo乾淨。剩餘network僅bridge/host/none；沒有prune其他資源。證據保留至2026-10-08T03:02:00Z，位置 `/workspace/shared/growth-internal-rc-evidence-20261005`，含preflight、phase-a.log、資源ownership、未到達artifact、cleanup.json/log；不含env／密鑰。

**根因與修正**：固定image entrypoint root準備data目錄後`gosu postgres`降為UID/GID999:999，再以psql讀初始化SQL。原operator共用0600 writer產生UID1000:1000的host檔，bind mount保留此ownership；容器postgres無讀權。`roles.sql`本身只有`\getenv password POSTGRES_PASSWORD`，沒有實際密鑰bytes，但執行時會讀取敏感env，因此不能用寬權限或將expanded SQL落盤解決。現在移除SQL檔案bind與host副本：先啟動db，等待final TCP server（temporary init server僅socket），一次`docker exec -i --user postgres ... psql -X -q -w -v ON_ERROR_STOP=1`由stdin送原模板；既有container env供密碼，只在psql／PG記憶體展開。角色SQL單transaction，關閉該session的statement／error statement echo，失敗不重送也不啟動Auth。成功才啟動其餘服務。截止仍逐Docker操作檢查。

**同根因核對**：其他compose掛載只有PG/MariaDB/WP data目錄，由各image原entrypoint管理；前次MariaDB healthy、WP running，沒有另一個host0600 SQL/config掛載。env_file由host Compose讀取而非container bind，繼續0600；Node自身config/secrets仍由同host使用者讀取700/600；後續schema既有stdin路徑不受影響。沒有chmod/chown秘密、增加root服務或改全域安全。

**本輪驗證迴圈**：PLAN/CODE為當前完整RC的Blocking P2，maintenance=0。UNIT/CONTRACT＋BUILD/RUN：8/8（原RC5＋新增3）通過；新增fixture實際固定PG17.6 UID999重現private檔不可讀而stdin可讀，無網路／ports，DB全tmpfs，public deterministic sentinel不是新credential；原SQL可執行、5roles、2個SCRAM值、auth.uid成立，故意duplicate失敗交易rollback，client stdout/stderr及server兩串logs均不含sentinel。測試後container與tmpfiles移除。最初fixture漏`docker run -i`造成stdin空，已修fixture且重驗，未改安全條件。CI新增同測試在既有pinnedPG準備後執行。

BROWSER/DOM、1280/390、SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK、TENANT：本修正不改UI／Auth/RLS／產品資料路徑，保留來源HEAD已通過的短命隔離測試證據；本輪本機不重跑這些不變路徑。CI照常回歸，**native persistent A/B仍NOT_RUN**，不可由fixture替代。VERIFY只限候選工程及秘密邊界；新HEAD CI/Preview與既有Reviewer裁決於交審報告附上，不能宣稱RC已完成。CoreMilestoneProgress為解除已證實bootstrap阻塞的可審候選，完整RC新增驗收進度=0。

下次仍有權限依賴：新一次provision／窗口／持久synthetic身份與秘密／單頁grant／清理需父一次向Owner請准；不需要Owner登入。舊批准與原消耗標記不可復用。原runtime disabled8b25、frozen11e3423b、hosted27及Owner網站保持原狀。

## 差距與本次完成範圍

1. **來源**：原預製 URL response 已從 WordPress 整體入口移除。現在每次 source POST 都實際 GET owned WordPress 的 robots／HTML，以原 `fetch_public_html`／`build_snapshot`／SQLite 保存建立來源；核對實際 HTML bytes SHA256、citation、三欄及編輯保存。canonical URL 為 `https://rc-source.example/bolt/`，網路 fixture 僅把兩條允許路徑接到本 run 的 HTTPS WordPress；沒有公共 DNS／公開站 live fetch，沒有新 live 額度消耗。產品 `scanner.py`／`product_source.py`／`product_api.py` 原樣，未加入 localhost 或 SSRF bypass。公開 DNS／TLS／SSRF transport 仍由原獨立 scanner suites 覆蓋，不將 fixture 報成公開網路驗收。
2. **接線**：新增受限 HTTP RC server，browser runtime→同源 backend proxy→既有 workspace Auth／membership／RLS／Save／exact Review，publication server 復用同一產品 API authority，逐次重驗 session／org／version／Review 與原平台 grant。只代理明列讀表與兩個既有 RPC，不代理 token mint／admin／任意 RPC。runtime connector 僅接新 RC 的 loopback native Auth／Data API，拒絕既有 hosted project fallback。預設產品 runtime 保持原 origin/key；雙份 disabled config bytes 未改。
3. **整個 runner 結束後**：已實作 standalone runtime，直接開 durable journal、載入同一原 grant，由獨立持久 Auth／SQL／WP 服務提供權威；無前一 runner 的 IPC broker、token map或記憶體 ledger 依賴。兩個獨立 `acceptance.mjs phase-a/phase-b` invocation，A 結束 browser/driver 且實際 SIGKILL app service，B 以新 native Auth session 開新service讀磁碟／SQL／原 WordPress。**此真持續環境驗收尚未執行**，依賴下方一次新批准；既有短命 run 的 HTTP整體驗證不能替代它。

原①②③與先前 process-restart assertions 保留。本輪不是再開一條mock產品；隔離驗證使用同一入口、原唯一 Auth fixture 與 native PG tests，真持續部署候選另有實際 GoTrue／PostgREST接線。未重建登入系統；僅抽出既有 callback navigation 步驟供原入口與 native-session driver共用。RC driver以三個synthetic身份的原生password grant取得真session，交由原callback／`GET /auth/v1/user`／membership契約驗證；不宣稱產品email/OTP UI已驗、不依賴Owner email/2FA。

## 新候選可審 envelope（PENDING；舊次數已消耗，不可重用）

| 項目 | 唯一候選範圍 |
|---|---|
| 環境與入口 | 同 execution host 的獨立 `growth-internal-rc-01` Docker Compose project；Node UI `http://127.0.0.1:8792`。Auth8794／DataAPI8795／WP8796／client-local TLS proxy8797，全綁127.0.0.1；PostgreSQL／MariaDB不公開port。不是Vercel或既有Supabase hosted部署。 |
| 平台／頁面 | 新建isolated WordPress，canonical `https://rc-source.example/bolt/`，固定page1001、不可修改control1002；三欄title/content/meta。reserved `.example` 只作隔離網路fixture身份，不宣稱DNS已部署。真公開來源如另需驗收，須新owned合法domain與額度；本包不呼叫。 |
| 身份 | GoTrue admin僅provision三個真正synthetic Auth users：owner/viewer/foreign@rc.example.invalid；UUID分別`10000000-0000-4000-8000-000000000003`／`...0005`／`...0007`。OrgA=`10000000-0000-4000-8000-000000000001`、OrgB=`...0002`；owner/viewer只屬A，foreign只屬B。非現有Owner身份，無郵件／SMS／OAuth。 |
| 原生服務 | 官方pinned GoTrue v2.196.0、PostgREST v14.17、原pinned PostgreSQL17.6、WP6.8.3與MariaDB11.4.8；完整digests在`deploy/images.json`／compose源碼。首次批准執行已取得images；PostgreSQL bootstrap失敗，Auth/DataAPI保持Created且未啟動。新候選尚未provision。 |
| 最小DB操作 | 全新local空DB建立原生Auth schema／roles（Auth自身migration），原business migrations＋已驗URL Save／Review proposals組成單transaction `schema.candidate.sql`；三個Auth users必須由GoTrue建立，業務SQL不插auth.users、不假造auth.uid身份。只seed兩org／三membership，讀表RLS與兩個RPC grant；沒有新通用publication schema，journal復用原格式。 |
| 部署／config | `operator.mjs provision` 一次，wx固定root與`.started`書籤防blind重跑；生成精確配置／短期限、服務env、journal header、client-local TLS及單頁App Password。`runtime.mjs`只read existing config/journal，缺失不重建。dynamic RC flags只在RC HTTPserver提供；原apps/web default flags完全不動，無global trust/security設定。 |
| 儲存位置 | 唯一 `/workspace/growth-internal-rc-01`，root/secrets700、secret files600；data/postgres持久Auth／SQL、data/mariadb與data/wordpress、data/publication.json、data/source.sqlite。只保留同一批准RC window，用於A完整退出→B重新登入；不是長期跨run grant。 |
| 憑證與權限 | 原生Auth JWT有效300秒，每次fresh登入重新簽發；JWT簽章key只在RC服務env，admin JWT僅operator記憶體，runtime/client不用service_role。synthetic password、App Password／原expiry、TLS私鑰只在owner-only RC secrets，不在repo／journal／artifact／browser；此持久secret是**下次必須新批准的事項；前次部分env已建立後銷毀，身份／WP grant未建立**。WP受原plugin約束單頁／三欄／900秒，app service每次核expiry與原生GET，不重發／延長。 |
| 期限／次數 | Owner批准後固定UTC expires_at，總provision／兩phase／清理窗口最多2小時；WP原grant取建立後900秒與批准絕對截止的較早者，A/B必須在原期限內，逾期failclosed，不延展。一次provision；3 real Auth users；每phase fresh-session所需login僅該三身份；本RC成功路徑2個WP POST（publish＋restore），第三提交在durable intent後、network POST前SIGKILL，B只GET，不重送。 |
| source／量測／費用 | 單一controlled page，source GET走隔離network fixture，零新增公開liveURL／模型／外部provider／OAuth／付費服務／domain／cloud計費。量測保存`baseline:null,followup:null`，新session讀回仍unknown，不冒充零、不等待SEO成長。源snapshot／journal有檔案寫入，非零writes宣稱。 |
| 成功條件 | A：實際HTML→UI三欄修改→正常handoff→native Auth→Save→logout／新native session→exact Review→WP publish API/HTML→明示unknown量測保存→verified restore→再preview／durable submitting／service被kill→寫無secret bookmark並完全退出。B：全新process/context/nativeJWT→SQL exact payload／Review→相同publication evidence／measurement payload／pending ID unknown→只GET confirmed_not_applied→viewer/foreign GET隔離、Save/Review/發布權限負測、SQL/audit與journal無拒絕案增量。 |
| 不確定／失敗 | 不rerun provision、不改request/intent、不重發POST、不以無回覆視為未套用；讀原journal+原頁expected-before/after。到期、撤銷、損毀、缺檔、drift停mutation，保存無secret證據；需要重新開grant或期限時另請准，不能重用這次allowance。 |
| 清理／保留 | 停兩個app processes後，先把allowlist evidence（bookmark需不含token/secret、PNG、journal/source synthetic資料、redacted logs）移到父指定artifact；保留最多3天。`operator cleanup`核同window及own labels，停exact五容器／own network，移除唯一root與own資料／secret，使用原PG image的network-none helper只刪own bind data；不prune、不刪外部資源。刪除該DB與站亦銷毀原生identity／grant；cleanup權限在expiry後只限原已批准收尾。部分provision失敗保留`.started`，只核對／cleanup，禁止blind重跑。 |

**批准 artifact identity**：`prototype/internal-rc/deploy/hashes.json`列候選程式、SQL、原scanner、Auth/RLS依賴與apps/web逐檔SHA256；`operator inspect`只讀顯示該sorted manifest 的SHA256 `artifacts_digest`。本候選digest（114項）：`04963bd0fd17e24ed1739e883834db3f447c026bbb8455ed5107ab12934f5cce`。父將該digest＋具體Owner批准reference＋絕對UTC截止填入 `window.example.json`副本，才可執行；目前example為null，不是批准。腳本的window欄位／reference是操作書籤，不是安全審核替代或自行批准機制。

```sh
# 現在可做：read-only、沒有部署或secret生成
node prototype/internal-rc/deploy/operator.mjs inspect
# 僅新批准後：不由本輪自動執行
bash prototype/internal-rc/deploy/run-approved.sh phase-a /workspace/rc-approved-window-third.json
# 等上一個 shell 完全退出後，以獨立命令執行；不共用runner記憶體
bash prototype/internal-rc/deploy/run-approved.sh phase-b /workspace/rc-approved-window-third.json
# 保存allowlist evidence後，按同一次批准清理；原secret不進artifact
node prototype/internal-rc/deploy/operator.mjs cleanup /workspace/rc-approved-window-third.json
```

原生服務設定依官方[Supabase compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)取最小Auth/PostgREST環境變數；固定synthetic UUID由GoTrue原生[AdminUserParams id](https://github.com/supabase/auth/blob/master/internal/api/admin.go)建立。原準備階段僅核官方源碼／image manifest。首次執行於PG bootstrap失敗，native Auth migration／password issuance與兩phase結果仍NOT_RUN；下次須新批准，不能以離線fixture報RC PASS。

## Agentic Verification Loop／目前證據

| 點 | 狀態與證據 |
|---|---|
| PLAN | PASS：父指定三缺口，完整候選與一個具體pending envelope；不開④Owner站，不把多writer／容災升Core。 |
| CODE | PASS：HTTPserver、受限proxy、產品authority复用、default runtime注入點、standalone原grant／journal、native部署／SQL候選與兩phase script。 |
| UNIT / CONTRACT TEST | PASS：RC5契約（HTTP界線、browser URL路由、candidate schema/RLS、pinned/local/storage config、manifest bytes）＋原publication/journal/measurement契約；原workspace API/mirror等另跑。schema smoke用isolated PGlite並明示fixture Auth users，不是假稱native GoTrue驗證。 |
| BUILD / RUN | PASS：短命run實際RC HTTP服務、owned WP、Python scanner；CLI/JS/bash syntax與schema重現。FAIL：首次persistent compose之PG bootstrap檔案權限；新候選未再次provision。Auth/DataAPI實際啟動仍NOT_RUN。 |
| BROWSER / DOM | PASS：原UI正常handoff、same-origin RC HTTP、three fields／status／API；無overflow/pageerrors。 |
| DESKTOP + MOBILE E2E | PASS：1280/390既有單一入口從實際owned HTML走scanner到成果、保存、Review、真WP、量測與SIGKILL恢復；每尺寸4WPwrites及原負測保留。NOT RUN：native persistent RC phase A/B。 |
| DATABASE / AUTH | PASS：原PG17六案、既有fixture Auth四負測與RLS；new schema offline檢查。NOT RUN：原生GoTrue JWT與persistentPostgREST實跑，需要pending envelope；hosted27無操作。 |
| SAVE／LOGOUT／FRESH SESSION／LOGIN | PASS：原完整入口使用原唯一synthetic session rig，HTTP代理實际SQL保存／exactReview；共用callback helper未變Auth semantics。NOT RUN：candidate nativepassword-issued session與整個runner消失後讀回。 |
| READBACK | PASS：同run serviceSIGKILL fresh context/token的exact payload/publication/measurement/pending；source HTMLbytes/citations保留。NOT RUN：所有runner消失的持續環境雙phase，不能外推目前結果。 |
| TENANT／PERMISSION | PASS：HTTP proxy不允許admin/arbitraryRPC/外Origin/錯source；原viewer/foreign原4個403與零SQL/audit增量、cold錯版/錯頁/unknown拒絕；candidate原生tenant腳本已備未執行。 |
| VERIFY | 本候選可做的repo／隔離驗證後commit/CI/Preview，exact HEAD與logs於交審回覆附上；既有Reviewer裁決，不自行APPROVE或執行pending envelope。 |

必要修正：provision每次寫入重檢批准截止，原生WP lease也cap到同截止，避免setup延遲使grant越窗；新runtime fetch把同源publication誤當backend origin而拒絕（P1），只增既有同源publication路由；source改canonical後原wrong-page負測先撞loopback port限制，改同canonical錯path，未放寬validator。secret mode負測受umask077影響，顯式chmod無敏感fixture檔才驗拒絕；未改真secret權限。

## Technical Debt／界線

多writer／跨WP與journal原子transaction、廣域／主機容災、惡意snapshot rollback、真provider／非UTC／SEO因果，沿753dd9c的P3：單一受控writer與unknown GET-only使本RC候選可審，不宣稱exactly-once；外部多writer、跨環境長期授權或真provider需求前重看，追蹤待Dot指派。此次持續secret/nativeAuth新批准是**未授權執行依賴**，不是可用P3掩蓋的已驗RC缺口；需父一次具體請准，獨立repo候選工作已做。

原runtime雙份disabled8b25、歷史frozen index11e3423b不變；原Auth/RLS/functions與scanner檔案未改，僅既有callback導航抽共用helper。無hosted restore/login/Save/Review POST、無安全拒絕重試、無Owner網站／外部帳密／費用。CoreMilestoneProgress=1（真HTML來源＋可信HTTP接線與完整RC可審候選），maintenance=0；不宣稱完整RC、MVP、liveM3或成效完成。
