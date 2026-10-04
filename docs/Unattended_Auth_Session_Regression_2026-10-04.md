# 日常 regression：無 Owner 在場的合成 session 驗收

2026-10-04。依 Owner 06:27 UTC 指示（Sentinel `3b3be33f4e0c8191b8987dbf99ae8cc1`）及 Reviewer `01a1059a-5089-7374-94f0-c261041cb6ec` APPROVE 附約束實作。基準 `5616220aa865d6b36073f22ec732246a88f72170`，父與 GitHub read-only workflow 回傳 CI `37182179082` success。bounded Review 候選保留為離線資產，等待真人時段不再是日常 regression 的前置條件。

## 一個全自動入口

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
node prototype/owner-workspace/auth-session-regression.e2e.mjs \
  --mode growth-os-isolated-regression --target http://127.0.0.1:8791
```

CI 使用已安裝的 Playwright Chromium，省略 executable-path 環境變數。入口依序執行獨立 guard/deployment 負測、**未修改**的既有 URL native PG17 suite、1280/390 真 UI/API＋disposable PGlite 流程。既有 CI 的 URL native step 移入此入口，原六项斷言完整執行；不是 skip 或放寬。CI entry 位於既有 pinned image 初始化與 Playwright browser 安裝之後。PG image 未存在仍 exit2，不嘗試下載替代來源。

實作只在 [fixture](../prototype/owner-workspace/auth-session-fixture.mjs)、[負測](../prototype/owner-workspace/auth-session-fixture.test.mjs)、[整合入口](../prototype/owner-workspace/auth-session-regression.e2e.mjs) 與 CI；沒有修改產品 Auth、部署 API、runtime config 或 frozen artifacts。沒有要求真人信箱、密碼、驗證器、遠端帳號、管理API／secret，也沒有官方 Auth engine 的管理憑證。

## 邊界與身份

- 啟動前必須有明確 `growth-os-isolated-regression` mode及唯一核准的 loopback target；單靠 NODE_ENV=test、staging 字樣或 Supabase URL 不成立。非test／錯target在 listen、fetch、DB create前拒絕。
- Runner 自建 loopback HTTP server與**無URL參數、只在memory的PGlite**。同輪 opaque isolation handle在private WeakMap綁定兩者；fixture每次操作重驗alive、server listening/address/port與DB身份。缺失／複製／偽造handle拒絕。local asset回應還須匹配runner專屬身份header；不連用既有未知server。
- 每輪只使用既有synthetic mapping：Owner `10000000-0000-4000-8000-000000000003`、viewer `...000005` 在Org `...000001`；foreign Owner `...000007` 在另一Org `...000002`。角色不可由client/header/query指定為管理者。
- 短效opaque fixture token只由runner發行與保存（預設60秒，上限120秒）、限該輪；不是JWT，也沒有任何真Auth效力。未知／過期／前輪token在SQL前401；Auth OTP路徑403，零寄信。測試登入走既有產品callback與 `/auth/v1/user`／membership路徑，但其Auth回應是合成的。
- 所有browser Auth／DB請求先由context route攔截；唯有固定backend目的地交给隔離transport，transport本身沒有fetch fallback。未知目的地直接abort。產品CSP保持不變，另以空白測試頁独立驗證runner的未知target拒絕；不靠CSP替fixture背書。service workers關閉，沒有HAR／trace／video或token artifacts。
- DB schema/seed/grant只在disposable初始化使用管理角色；每個資料API操作都在交易內 `SET LOCAL ROLE authenticated`＋固定actor，並核 `current_user`／`auth.uid()`。permission/RLS斷言不使用管理角色代替。唯讀結果快照與request共用序列，避免管理角色讀取與權限驗收交錯。
- finally關閉所有contexts、清token map、關閉DB/server。錯誤輸出會遮蔽token與callback fragment；日誌只列案例結果／安全ID，不輸出credentials。

## 實際驗收與分層證據

| 層次 | 本機結果／證明 | 不代表 |
|---|---|---|
| Synthetic session流程＋真UI/API | 1280/390 PASS：Owner Save → Logout → close舊context → 全新context／新token／空cookies、sessionStorage、localStorage及editor DOM → callback →精確version UUID與完整payload讀回；晚到detail回覆不能填入登出後DOM | 真Auth發證、OTP信箱、JWT驗簽、2FA |
| SQL RLS／permission（隔離PGlite） | 1280/390 PASS：Owner保存恰好+1parent/+1version/+1audit；viewer可讀OrgA但不可寫；foreign在自己Org為Owner，但不可讀寫OrgA；拒絕後所有public資料／audit快照零增量 | 注入actor已被Auth引擎認證；foreign不能寫自己的Org |
| 原生PG17（既有suite完整重用） | 6 PASS：同request、同version競爭、跨parent request、Save先於撤權、org等待期間撤權、membership等待撤權；真獨立backend／鎖／原子性 | browser這輪PGlite資料就是nativePG資料，或真Auth整合已驗收 |
| 獨立安全負測／部署排除 | 4 PASS：非test/錯target/缺handle時listen-fetch-DB計數均0；短效/未知/前輪token與OTP拒絕；未安裝fixture的產品client在Auth401時不建立session、不讀membership/不mutation；部署output/import closure不含fixture | production Auth或部署設定經真人challenge驗收 |
| 官方隔離／真Auth engine | **未採用、未測** | 不以synthetic結果冒稱真Auth engine PASS |

產品 `signOut()` 清除頁面記憶體；測試明確確認這不等於server token撤銷。之後runner淘汰舊fixture token是測試生命週期管理，不能當產品撤銷能力。fresh context不複用舊token、storageState、cookies或editor DOM。

獨立負測可用 `node --test prototype/owner-workspace/auth-session-fixture.test.mjs` 重現。部署排除依現有vercel output `apps/web`、全部靜態JS import closure、`api`及指定的三個Python include來源核對；fixture只在prototype測試目錄。沒有新增query/header/localStorage登入bypass。實際closed config SHA仍為 `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`，v2九檔freeze及boundedReview候選hash保持原樣。

本機使用現有Chromium151；同HEAD CI的Chromium／workflow結果另據GitHub核對，不以本機PASS推定CI。必要的既有workspace contracts與config隔離檢查保持。

## 真人登入政策與剩餘限制

日常 regression 直接跑此入口，不等待Owner。真人登入只保留Owner指定四類：Auth/callback/magic-link/OTP本身修改、release candidate、重大milestone終驗、平台強制真人challenge。Owner只完成登入／2FA；之後操作由Dot/Codex在當次授權範圍內完成。本次無真人登入、無remote DB/migration/ACL/Save/Review/發布／費用。

若另行加入官方隔離Auth引擎，需另列環境、帳號生命週期、管理憑證及清理範圍；本方案不擴remote許可。既有P3 marker文案debt繼續延期。完整M3／Publish／Measure及真Auth engine驗收仍未因此完成。


## M3 Review 串入同一入口

已接受前版：`c3f9f37372edb0b1a7fdf157d600c48e06b085c6`，Reviewer `01a105b7` APPROVE；父確認 CI [37183932027](https://github.com/RC918/Growth-OS/actions/runs/37183932027) success、Preview `4jwTTT28CKR7Qjicbja3Pt6qrjbys` success。本增量只改兩個既有test harness與本文件／PROJECT_STATUS，CI仍自動執行同一入口，不新增工作流或產品程式。

現有獨立Review suite已驗證來源／身份漂移、未知結果、取消、並發及原子性；不重寫那些情境。本次補的是日常入口缺少的串接：

1. 合成URL成果由既有匯入與Save UI保存v1；五項Review勾選後送出既有RPC。隔離SQL核對exact version、actor、source/content/version digests、checks，恰好1 review＋1 review audit。
2. 進入續編令目前確認失效；未保存文字／storage／cookies在logout、關閉舊context後不帶到全新context。新token登入後，GET精確讀回原v1完整payload與同一review UUID；讀回不再mutation。
3. 既有editor修改title、核對、準備意圖並Save v2；再次logout／全新context讀回v2完整payload。v2待確認、checks全空；v1同一確認只作歷史，原v1 row與review完整保留。最終總增量1parent／2versions／1review／3audits，2 Save＋1 Review成功操作。
4. viewer可讀OrgA版本與確認，foreign Owner無法讀OrgA；兩者對OrgA Save與Review都由真SQL權限拒絕（共4次403），每次所有public表與audit快照零變化。未知目的地仍abort，沒有network fallback。

**本機1280／390兩種viewport全通過。** 入口內4個安全負測、既有URL native PG17六案全通過；另跑 `node --test prototype/owner-workspace/url-review.test.mjs prototype/owner-workspace/url-result-bound.test.mjs supabase/drafts/url_review/offline.test.mjs`，19 tests PASS（含7 SQL子檢查）。Review原生PG17五案保持既有CI step完整執行。最初harness誤找legacy的history折疊selector，已依URL card既有逐版DOM修正並完整重驗；產品未變。

證據仍分層：browser session為synthetic；Save／Review／RLS／permission為disposable PGlite中authenticated＋固定actor執行的真SQL；native並發是獨立PG17 suite。**真Auth engine發證／JWT驗簽／OTP／2FA未測**，signOut頁面清除不代表server撤銷。本入口從synthetic payload匯入開始，不宣稱live URL抓取、模型品質或發布已驗收。runtime closed與frozen檔案零差異；舊bounded Review候選未改、cutoff未綁定。

| M3條件／依賴 | 已有證據與剩餘放行条件 |
|---|---|
| 微調、取消、版本／來源失效、未知結果安全恢復 | 已有saved-result及url-review專用suite；本次把成功Review與修改／新版本不繼承串入同一入口；不再加無阻塞edgecase |
| 保存、新session版與確認讀回 | 單一入口1280/390 PASS；歷史bounded v1/v2另有真保存讀回證據；新Review不冒稱remote驗收 |
| owner/viewer、tenant、不可覆寫歷史、atomic review/audit | 本入口authenticated SQL拒絕／RLS、既有7 SQL與5 native檢查；不靠fixture角色宣告代替SQL |
| 完整產品M3 | remote URL Review schema/RPC尚未安裝／授權啟用；需要具體remote envelope，不能用CI或Preview宣稱放行 |
| 100cap來源恢復 | `prototype/public-audit/product_api.py` MAX_REPORTS=100，BEGIN IMMEDIATE計數後拒絕新snapshot；export沒有刪除。既有UI保留最後成果已驗，不等於第101筆可用。這是來源生命週期依賴，不阻擋本次已保存版本Review |

下一個真正產品Core：在選定產品環境讓已保存URL成果可做權威exact-version Review。需要決定單次bounded驗收或持續產品啟用；前者已有候選，但仍需新批准的project／actor／org／version／request／artifact hashes、cutoff、tracked opening/cleanup migrations、有效ACL、config transitions、最大1 Review／1review+1audit及0 Save、readback／未知結果reconciliation範圍。後者需另核持續授權生命週期，不能拿舊bounded模板永久開放。真人challenge只按既有四類政策，不把這個測試slice當新重大milestone。沒有批准前停止remote工作，而非再建登入harness或拆maintenance。

若轉向下一URL来源Core，100cap解除所缺的是權威保存位置、保留／淘汰政策及tenant配額scope決策；不得默認刪舊snapshot、提高cap或另建store。M4還需單一試點平台與站點授權決策，M5需可信資料授權；這次不提前實作。P3 marker文字debt繼續延期。
