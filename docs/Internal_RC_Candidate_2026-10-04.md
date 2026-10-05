# 完整內部 RC 候選與待批准執行 envelope

基準 `753dd9c47655e961221a1ef6be9bf8a9aef7194c` 已由 Reviewer `01a10857-2c6c` APPROVE；CI `37226680267` 59步、Preview `H6gCsEbPeZw3TMUoJ7xnbfUETxpX` success。父本輪指定收斂完整 RC，沒有授權真持續環境執行。本文件及 `prototype/internal-rc/` 是新候選，沒有修改歷史 frozen 包，也不因名稱 RC 自動取得新權限。

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

**批准 artifact identity**：`prototype/internal-rc/deploy/hashes.json`列候選程式、SQL、原scanner、Auth/RLS依賴與apps/web逐檔SHA256；`operator inspect`只讀顯示該sorted manifest 的SHA256 `artifacts_digest`。本候選digest：`9c6bc1e3aef9ba787ba97fe41f5e183ec0f32cd597669623562fb7682c38991f`。父將該digest＋具體Owner批准reference＋絕對UTC截止填入 `window.example.json`副本，才可執行；目前example為null，不是批准。腳本的window欄位／reference是操作書籤，不是安全審核替代或自行批准機制。

```sh
# 現在可做：read-only、沒有部署或secret生成
node prototype/internal-rc/deploy/operator.mjs inspect
# 僅新批准後：不由本輪自動執行
bash prototype/internal-rc/deploy/run-approved.sh phase-a /workspace/rc-approved-window-next.json
# 等上一個 shell 完全退出後，以獨立命令執行；不共用runner記憶體
bash prototype/internal-rc/deploy/run-approved.sh phase-b /workspace/rc-approved-window-next.json
# 保存allowlist evidence後，按同一次批准清理；原secret不進artifact
node prototype/internal-rc/deploy/operator.mjs cleanup /workspace/rc-approved-window-next.json
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
