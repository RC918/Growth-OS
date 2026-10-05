# GSC 原生日期／來源契約驗證

本 Core 基準為 PR21 `0bd9d3e63041ec7555c29307cff222e7ff09e4a7`（父回報 Reviewer `01a10b27-ac08-7679-8f3a-9aff0151812c` APPROVE）。獨立 branch `feat/gsc-native-date-contract`，stacked Draft PR base `feat/single-site-pilot-candidate`；不合併或改動 PR19／20／21。Primary VERIFY 不是最終驗收；交既有 Reviewer。

## 使用者結果與契約

Before：單站候選只能顯示未知量測，舊隔離 CSV 比較採 UTC 日。After：單站候選在確切版本／Review／發布讀回旁保存 GSC-style `date,clicks,impressions` 與來源、property、完整頁面、搜尋類型、篩選、匯出時間、final 聲明；新 session 能讀回相同發布關聯與最小正規化資料。沿用既有頁面 CSV 算術與 PR21 持久紀錄，不新增 provider adapter／OAuth／SQL schema。

[Google Search Analytics 官方契約](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) 說明日期使用太平洋時區、日期維度可省略無資料日、page equals 區分大小寫，API 不保證回傳所有列。本實作因此保留原生日期標籤與每天總量，不將 UTC 彙總改標或拆日；用 America/Los_Angeles 午夜的絕對時間核對邊界。UTC 僅表示邊界瞬間，沒有轉換每日流量。2026-03-08 為23小時，2026-11-01為25小時。

基線完整日終點不得晚於修改；後續完整日開始不得早於發布讀回，終點不得晚於恢復開始、同頁新發布或下一版本建立。新版本時間不可取得時停止後續比較。原資料留存，read 時重新判斷適用性。前後須相同來源／property／搜尋類型／篩選、等日數且不重疊；缺日不補零、空列集合 totals=null、明確0保留；無資料不表示未收錄，indexing_status=unknown、traffic_verified=false。synthetic／provider_asserted 均是聲明，沒有所有權或真資料驗證；未來日期僅隔離 synthetic receipt 接受並明示情境。

保存前重核當前 tenant／version／Review/session、原短 write grant 與截斷資料，過期只讀歷史。保存遺失回應顯示未知並停用 Save，先讀回、不自動重送；相同正規化內容不重複 append。journal 保存日期列、口徑、publication_id、binding 與 readback_observed_at，不保存整份上傳噪音或 secrets。原 WordPress 最多一次發布＋一次恢復及 unknown GET-only 語義維持。

## Agentic Verification Loop

| 驗證點 | 適用性、結果、證據 |
|---|---|
| PLAN／CODE | 適用；上述 before/after，復用 CSV／receipt／history；無平台擴權。 |
| UNIT／CONTRACT | 適用；[contracts.log](evidence/GSC_Native_Date_2026-10-05/contracts.log) 63/63，包括新5契約、舊CSV、page、measurement、workspace API、publisher、journal、RC；DST23/25、±1ms邊界、來源／property／頁面／filter／type、缺日／空／零、匯出完成、截斷、compact保存等。 |
| BUILD／RUN | 適用；原生 ES modules 無獨立編譯。隔離入口啟動現有 service／PG／WordPress6.8.3／MariaDB11.4.8，使用既有 scanner 讀實際隔離HTML。[fixture.log](evidence/GSC_Native_Date_2026-10-05/fixture.log) 4/4 含 deployed output 不帶測試 bypass；RC manifest 更新為115檔，approval仍null。 |
| BROWSER／DOM | 適用；已查看兩張截圖，正常換行無橫向溢出、來源與未知清楚、Save高度≥44px，原生日期／檔案／select。 |
| DESKTOP＋MOBILE | 適用；[e2e.log](evidence/GSC_Native_Date_2026-10-05/e2e.log) 1280／390完整入口、鍵盤Enter、錯頁拒絕、缺日1/2、完整合成差異5clicks/30impressions、lost reply只讀。 |
| DATABASE／AUTH | 適用；原生PG權限及六項鎖競爭；synthetic session受既有隔離入口限制，Auth engine issuance／JWT／OTP／2FA NOT TESTED，產品signOut仍只清page memory。沒有SQL migration／hostedDB操作。 |
| SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK | 適用；保存→service關閉重開→登出→全新browser context及token→重新登入fixture→exact publication／binding／data／assessment深比較；舊token拒絕。[1280 proof](evidence/GSC_Native_Date_2026-10-05/1280-gsc-proof.json)、[390 proof](evidence/GSC_Native_Date_2026-10-05/390-gsc-proof.json)。 |
| TENANT／PERMISSION | 適用；viewer／foreign讀寫拒絕，錯來源／property／頁面／時區／期間拒絕，journal與SQL資料／audit零差異；GSC保存讀回無WordPress GET/POST。 |
| RESTORE／EXPIRE／VERSION | 適用；原WP發布＋恢復合計2POST。恢復／新版本後歷史原資料保留但失去後續比較；expired有效baseline-only save確由expired gate拒絕、backup restore唯讀、新v2未知、logout晚回應丟棄。測試容器／tmpfs／TLS secret已清理。 |
| VERIFY | 本機範圍通過；[SHA256](evidence/GSC_Native_Date_2026-10-05/SHA256.json)覆蓋7份log／proof／截圖。exact HEAD CI／Preview在PR交付核對，Primary不自行APPROVE或開始新Core。 |

重現：`node --test prototype/gsc-measurement/contract.test.mjs prototype/csv-import/search-baseline.test.mjs prototype/owner-workspace/page-observation.test.mjs prototype/owner-workspace/publication-measurement.test.mjs prototype/owner-workspace/workspace-api.test.mjs prototype/wordpress-publish/publisher.test.mjs prototype/wordpress-publish/journal.test.mjs prototype/internal-rc/contract.test.mjs`。完整入口：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --gsc`。CI使用其已安裝Chromium，不需本機path override。

## 重入 RCA／SYSTEMIC_FIX（同 Core）

實際過時來源是此 delegation 開始的 orchestration-only 訊息：要求 checkout feat/passwordless-workspace、核6663與PR19。GSC前段已依最新派工在PR21基準完成修改及測試，但重入時錯把最早可見訊息當最新authority，執行了fetch與checkout；checkout因既有rc-evidence worktree占用而拒絕，未切換／reset／stash／drop。這不是repo branch失效；前段GSC修改都保留。

mission第1條／engineering第1條本已有「最新指令／不套用歷史HEAD」guard，失效是重入判定沒先套用它，不是CLI loader或skill discovery。只修 recovery 第4條的 authoritative reconcile：先核最新派工Core／branch／base，再檢status/diff及未追蹤內容歸屬；相符進展保留續作，dirty及歷史worktree占用不自動STATE_DIVERGED。未新建治理檔／PR／task。事後實查branch=feat/gsc-native-date-contract、HEAD=0bd9d3e63041ec7555c29307cff222e7ff09e4a7；所有既有diff皆本GSC Core，63契約與雙尺寸完成logs吻合；不再次checkout歷史branch。本規則能提供恢復檢查點，不宣稱僅文件修改即可保證agent永不誤讀。

## 未完成與 Technical Debt

- 真GSC連線／OAuth／property所有權／provider匯出真偽／真流量與索引狀態：未執行；本輪只有synthetic及caller聲明契約，不宣稱完整MVP或SEO效果。
- 主機啟動：目前候選Node service與私人持久目錄未hosted；靜態Preview/Python API不等於Node publisher已部署。正式startup、TLS/proxy、監控、backup/restore運維、persistent secrets/grant均需另一個批准envelope。
- 成本未知：未建立資源／帳號／費用／持久grant；不能聲稱免費運營。未來選host後才能確認成本。
- 相容性範圍：隔離驗WordPress6.8.3／MariaDB11.4.8、Node24 Intl tzdata；未驗任意主機／SEO plugin／theme／代理設定，正式站需專屬兼容核對及獨占編輯窗口。CSV接受既有標準化英文三欄，非任意locale GSC原始下載檔；不會靜默改UTC資料。
- 以上均沿既有pilot部署／provider整合限制列P3 deferred：影響真站上線，未阻塞本次原生日／持久讀回契約；暫時feature預設關閉且明示未驗真。觸發條件為Dot選真站／provider Core並取得相應授權，負責追蹤待Dot指派。未趁本輪重構／修其他P3。
