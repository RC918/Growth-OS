# 三頁 WordPress theme／內容垂直成果

## 最新授權與切片

父核 Reviewer `01a10f18-4cc4-766d-8ba4-0bde0f4f73cd` APPROVE_WITH_DEFERRED_DEBT PR25 `b7d2e93e01793d3cb33a6709fbcdacd1892d0006` 後，建立 `feat/private-site-theme`，stacked base `feat/private-site-schema`。重入先讀AGENTS最新派工入口、status/HEAD/base；工作目錄原為乾淨，未切PR19、未動RC worktree／frozen runner或hash。

Before：接線＋新schema候選已有，正式三頁仍缺精確Product ownership與可核稿theme。After：三頁內容與theme只標記真正產品頁，連原生新schema/Auth、實際scanner、gateway及publisher完成受控發布與恢復，Privacy保留公開阻擋項。[候選／操作邊界](../prototype/private-site/theme/README.md)。

**完整恢復拆下一slice（已在工程前回報父）。** 父明確允許完整恢復超出最小可審slice時先交三頁垂直成果。查核既有store.backup只含publisher journal，沒有WPfiles/MariaDB/scannerSQLite共同quiescence切點；本輪不以個別檔案複製冒稱一致性整站備份。已交[精確下一slice manifest](../prototype/private-site/theme/recovery-manifest.json)，status NOT_IMPLEMENTED_NOT_RUN，包含跨store共同checkpoint、秘密/credential處置、nativeAuth linkage、unknown不重放及新隔離目標驗收。無需因此停止三頁工程或向Owner要求普通工程批准。

## Agentic Verification Loop

| 點 | 適用性與證據 |
|---|---|
| PLAN | 三頁垂直結果、父允許的恢復切片、原Auth/tenant/unknown界線。未部署／無hosted資料或費用。 |
| CODE | content.json從既有三份核稿草稿生成及來源SHA；classic PHP/CSS theme無框架/外部fonts/JS/會員/商店/表單。Product同時綁ID+slug+kind+name+單一plain paragraph；其他sections在Product外。 |
| UNIT / CONTRACT | theme draft一致性／Privacy blockers、schema及frozen RC契約。以實際runtime驗證補充static assertions。 |
| BUILD / RUN | node content builder、官方pinned WordPress6.8.3/MariaDB11.4.8，tmpfs site/db；native PG17.6/GoTrue2.196/PostgREST14.17使用PR25 business候選。無production installer或遠端build。 |
| BROWSER / DOM | 實際WP HTML；三頁exacttitle/meta、產品一個name/description/articleID、控制頁0Product；public-ready=false。只允許本run gateway/固定logical backend/ownedWP，沒有hosted fallback。 |
| DESKTOP + MOBILE | 1280/390三頁截圖、skip link、導覽可見focus/44px、無橫向溢出；鍵盤Save/Review/Publish/Restore。不是完整WCAG認證。 |
| DATABASE / AUTH | 同新schema native runner：70真Authmigrations、server-issuedJWT、nativeGETuser、ACL/RLS/defaults、anonymous/viewer/foreign/deleted拒絕。theme不改schema SQL或role。 |
| SAVE | 真WPHTML→未改scanner Python HTTP→first-result核對→既有JSON匯出/匯入workspace→native Save；不是本輪一般opener handoff驗收。 |
| LOGOUT / FRESH LOGIN / READBACK / REVIEW | GoTrue logout/refresh拒絕、新context/serverJWT、exactpayload版本讀回後Review；原生HTTP authority再次核Auth/member/version/review。 |
| PUBLISH / RESTORE / UNKNOWN | 既有Node child host/gateway/WP REST；丟棄已commit的publish與restore回覆，unknown只GET查回，每尺寸publisher2POST；rawtitle/content/meta精確恢復，About/Privacy SQL+HTML不变、直接REST403且attempts仍2。 |
| RESTART / VERSION / RECOVERY | publisher child重啟→fresh native session→原unknown operation查回；journal backup到新readonly目錄→新host exacthistory讀回、write拒絕；新v2後v1歷史仍可讀但preview拒絕。完整WPfiles/DB/SQLite共同還原不適用於本slice，明記未實作／未驗。 |
| MEASURE | 透過既有「讀取此版本量測」讀回，baseline/followup未知（不是零）；無GSC、analytics、模型、真流量或因果宣稱。 |
| TENANT / PERMISSION | viewer可讀保存版本，publisher歷史拒絕且SQL不變；兩控制頁拒寫。原native suite覆蓋foreign/匿名/直接寫入/重放。 |
| VERIFY | 本機/CI exact結果及hash交既有Reviewer；Primary不自行APPROVE，不啟動公開站或下一Core。 |

## 必要修正紀錄

- Fixture初版Privacy預設1003可能撞到WordPress建立的revision，造成錯誤parent/permalink redirect；改用wp_insert_post實際返回ID，SQL控制快照跟隨該ID。gateway拒redirect規則維持，theme仍綁真page identity。
- 測試最初抓舊 `.pilot-measurement` placeholder，再讀了尚未操作的GSC panel；根因是本輪沿用已審gateway啟用的GSC-style UI需明確click `.measurement-read` 才產生readback，不能把未讀取狀態當零或缺功能。依現有load流程等待成功，再斷言兩期間未知；未修改產品界線或以寬鬆文案match代替真正readback。

## 內容事實與公開門檻

營運者、email、候選domain、AWS/Supabase新加坡、ZohoUS依父最新已知事實；BrevoFree待核。Privacy不宣稱SMTP/analytics/第三方實際接線、保留期限或合規政策已生效。metadata與可見文字均public-ready=false，但此提示不是存取控制；私有gateway/防火牆仍需批准後部署。WordPress fixture內page_status=publish只供隔離HTTP驗收，非公開發布。

保留既有產品方向與三頁文案主張：開發中、目前隔離驗證、無真客戶/價格/評分/成效。Product description為明確摘要，其他說明sections不被publisher三欄改写；控制頁不隨改善更新。

## Evidence 與剩餘工作

本機run `growth-native-http-d84500d5-b889-4e67-ba07-7ad82d3c0e3e`，完成清理 `2026-10-06T03:04:20.118Z`，兩尺寸PASS；[11份payload與SHA256SUMS](evidence/Private_Site_Theme_2026-10-06/)包含native report／theme proof／三頁各兩尺寸及restore截圖／契約log。exact CI/Preview記在PR交審包。證據只含隔離內容、DOM截圖、ACL/HTTP結果、history/backup摘要，不留token/password/跨runsecret。測試工作目錄、WP/MariaDB/native容器與網路按原owned cleanup清除；journal archive不作production備份保存。

完整跨store一致性備份/還原為父允許的下一Core slice，不是本輪PASS；Supabase備份只manifest，無真project連線。正式內容Owner核稿、Privacy實際資料流/保存刪除核定、public部署授權仍為公開前門檻。P3 source共享loopback limiter與CIactions Node20/24警告沿PR24延後：本輪無新增traffic、既有CI可用，不阻塞theme隔離結果；上線/traffic/平台升級時由Dot指派處理。host capacity/whole-backup亦未live驗，部署前須核；未擴修其他maintenance。CoreMilestoneProgress=1，maintenance=0。
