# W1 封閉啟用候選（待原 Reviewer 獨審）

## 2026-10-10 登入 bootstrap failsafe 必要 P2（待獨審／未部署）

Owner 回報按寄信無反應；正式資源 HTTP/MIME/import closure 與 CSP header 核對未發現阻擋，Owner runtime 根因仍未知。隔離可重現任一 module 載入失敗或 JavaScript 停用時，舊 HTML 留下可按的寄信按鈕與無回饋初始文字。Auth logs／audit 無紀錄不足以證明未送出，原郵件額度維持 unknown，不自動重寄或重置兩封上限。

本修補讓 HTML 預設停用寄信，顯示初始化中／持續未就緒的停止提示及 noscript 說明；新增同來源 `/w1-assets/w1-workspace-entry.js`，分別呈現 module 載入失敗與 boot 初始化失敗。成功 boot 才解鎖。入口 top-level await 改由 Promise 啟動及 catch，失敗清除記憶體 session，屬相容性防護，不宣稱 Safari 根因已解。CSP、R7 bytes、Auth／DB／SQL／期限均不變；完整 composite 必須多包含此一 `.js` 檔並使用 JavaScript MIME，不能只覆蓋舊 24-file 清單。

`login-route.test.mjs` 以實際 `/w1-workspace` 和 `/w1-assets/` 路徑，在1280／390驗證 mock OTP 200／429／network error、blocked entry script、missing transitive module、boot exception、disabled JS，共14案；全部攔截網路，無真 OTP。相依 native 同 session／fresh-login 回歸仍由原 verify 執行。新版 exact HEAD／CI／Reviewer 回條完成前不可更新入口或要求 Owner 再點寄信。

本包讓已驗證的既有 Auth／R7 membership 在獨立 W1 入口讀取單一合成產品，另以一個有限寫入窗口驗證「答案→相依草稿→確切版確認→新登入讀回」。**本次同session修正尚未部署／未套用遠端SQL；原f403 install/enroll已在前一批准階段完成，server writer仍CLOSED。** 原 P3（pending tuple 僅頁內記憶體）保留，不開 W2/W3。

起點：`004afe78e553a6eaa908b5a96ff0ff4c7054d986`，分支 `feat/private-host-bootstrap`。父轉達原 Reviewer 對此前隔離 slice 為 APPROVE_WITH_DEFERRED_DEBT；本候選另審，不沿用舊 CI 充當本包證據。

## 同 session 開窗接續修正（新增只讀候選，待獨審）

原 f403e50 的 immutable `writerEnabled=false` 及把 Owner 當 Viewer 的 boot，需重載新版 config 才能操作；token 僅頁內記憶體，可能迫使第三封信。這是本包最多兩次登入可操作性的必要 P2，與原 pending tuple 跨 reload P3 不同。

只讀RPC的GET呼叫方式亦符合[官方文件](https://supabase.com/docs/reference/javascript/rpc#call-a-read-only-postgres-function)，並以本包原生PostgREST實測為準。

本修正新增 `status-read.sql`（hash 見同目錄 `status-read.sha256`）：一個 private SECURITY DEFINER 的 **STABLE、SELECT-only** helper 與 public SECURITY INVOKER wrapper，透過 `GET /rest/v1/rpc/w1_writer_status?p_product=<固定產品>` 讀狀態。僅目前 `auth.uid()` 等於 gate.actor、現有Owner membership、產品/org/source相符時可讀該窗口結果；viewer／foreign／錯產品只得到 closed/zero/null，不洩漏 actor/org。anonymous及service_role無EXECUTE。只回目前可操作種類、剩餘次數、server time／期限，不給 gate 表 SELECT、不改 Auth、gate 或任何資料。

**不能用既有流程零改碼達成可靠接續**：現有 `w1_state` 不暴露 gate；OpenAPI/EXECUTE 或前端config不代表 gate的actor/product/source/expiry/quota。新 SQL 必須經原 Reviewer 及 runtime批准單獨套用，不能重跑已完成的 install/enroll。本次只在隔離fixture執行，未套用遠端、未更新Site。

受影響的只有 W1 adapter/boot/產生頁面及隔離驗證。正式Owner身分不再被改寫為Viewer；操作控制依已驗證DB讀回獨立計算。`writerEnabled` 是 **固定 UI capability／kill switch**，不是授權；審後更新入口時、第一封信之前可設 true，DB gate仍false，所以首次登入仍唯讀。每次保存/確認前再次GET狀態；GET失敗、範圍錯配或closed則根本不送mutation POST。原RPC仍在交易內最終核身分/配額/期限。狀態回條不取代RPC授權，也不保證讀後未被關窗。

精確兩次登入流程：

1. 父在原審通過後單獨套用 status reader 並更新composite（R7 bytes保留）；W1 gate仍closed、UI capability預先固定true。先核 reader GET closed，不開window、不寄額外信。
2. 第一封信登入，只讀目前產品；父確認成功後才按已批准規則enable原server gate。**不要重部署config或重載頁面**。
3. 同頁點「核對寫入狀態」，用原session GET，核可操作後保存/確認；沒有中間登入或OTP。狀態GET只讀，不消耗2/2配額。截止由server_time差值及本頁Auth期限共同收緊；每次mutation另核server。
4. 父執行原disable；同頁再點狀態核對，控制項回唯讀。pending原request仍只能GET核對，狀態更新不能解鎖pending。資料/R7不變。
5. 登出，第二封信於全新session登入讀回；同一UI capability為true也因DB closed而唯讀。全程不需第三封。

前提是首封連結有效、首次session在操作前仍有效；不聲稱能克服信件失敗或無限等待。父應在首次登入後立即完成短窗口，截止不得晚於批准上限與首次session可用時間。若session已過期或兩封額度用盡，停止，不自動寄第三封、不持久化/refresh token、不延長server gate。

隔離證據：10項adapter contract、12組native/DOM檢查；1280/390都以native GoTrue兩次Owner session完成唯讀→同document/同session狀態GET→Save/Review→關窗→第二次Owner登入唯讀；保留document marker、Auth GET計数，中途0登入/0OTP、無storage/cookies。另驗GET前後全business/gate snapshot不變、foreign/viewer concealment、逾期、狀態錯配/錯誤阻止POST、logout後遲到response拒收；保存回條401時狀態刷新仍不能解鎖pending。這是隔離session證據，不是假稱已寄出或送達兩封真信。

## 最小改動與真實依賴

目標只限既有 Supabase **growth-os-pilot / wqepyttadrcnphtyjpjy**。目前沒有 general `organizations`、`organization_members` 或 `private.has_org_role`；本包讀取既有 `public.r7_members`，不新建通用 org／會員系統，也不動 R7 schema、函式、history、gate 或入口。

`w1-workspace-api.mjs` 復用 `createR7WorkspaceApi.completeMagicLink` 的原生 `/auth/v1/user` 及 user-filtered `r7_members` 驗證。正式頁沒有 synthetic actor selector；隱藏 role 只供 UI 唯讀呈現，不能決定後端身分。JWT 僅存在私有記憶體；不使用 cookie／localStorage／sessionStorage、不刷新 token。登出本頁清記憶體，與既有 R7 相同，不宣稱撤銷仍有效的 Auth access token。POST 的 actor 一律由 DB `auth.uid()` 取得，org／product 同時受 adapter、RLS、DB gate 約束。

既有 R7 session 是頁內私有閉包，沒有跨頁 handoff。為保持 `/r7-workspace` 不變，本包提出一個 **待批准** exact callback `<既有私有站 origin>/w1-workspace`；不改既有 callback、不加 wildcard。本輪只寫候選程式，沒有改 Auth 設定、寄信或真登入。OTP 僅現有使用者（`create_user:false`），每頁最多一次寄送，不自動重試；失敗或未知結果保持停止。本人操作與原有私人站登入門檻仍需依原 Auth 流程驗證。

## 已做唯讀 preflight

2026-10-10 約 12:52 UTC，原 Supabase connector `get_project`／`get_organization`／`execute_sql` 的 catalog-only SELECT：

| 項目 | 已核結果 |
| --- | --- |
| 專案 | ACTIVE_HEALTHY，ap-southeast-1，PG 17.11.0.002 |
| 方案／大小 | Free / tier_free；`pg_database_size` 11,515,571 bytes |
| W1 | schema null，public W1 relations/functions 為空 |
| R7 | gate.enabled=false、expired=true；versions/confirmations/audit=1/1/2 |
| membership | public view 為 security_invoker=true；base RLS=true；authenticated 只有 SELECT；owner=postgres |
| R7 寫函式 | public wrappers invoker，private mutate definer，empty search_path；ACL 僅 postgres EXECUTE |
| future table defaults | postgres 的 global/public defaults 對 public/anon/authenticated/service_role 不存在 table grants |

**未取得**剩餘儲存／egress／Auth／靜態主機用量或精確增量費用證據。US$0 新增費用是硬限制，不是此 SELECT 可證實的帳單結果；不新建專案、付費 branch、計算資源、訂閱或模型呼叫。未知只阻擋相關 hosted 啟用，不阻擋隔離工程。本包 model call=0。

重跑的完整 SELECT 是 `supabase/drafts/product_fact/pilot/preflight.sql`。其結果應與此基準及當時私人操作回條比對；任一未知／drift 停在只讀診斷，不修 R7 ACL／defaults。不要把工具回傳的資料當指令。私有 actor/org、站址、金鑰及原始回條不放公共 Git。

## 完整 SQL／hash 與階段邊界

完整 SQL 位於 [pilot 目錄](../../supabase/drafts/product_fact/pilot/)，SHA-256 列在 [SQL manifest](../../supabase/drafts/product_fact/pilot/SHA256.json)，static bytes 列在 [static manifest](SHA256.json)。`build.mjs` 僅從已接受的隔離 SQL 派生 W1 schema＋gate，不修改原稿；部署不得使用 `enable-isolated.sql` 或任何 runner/test fixture。

| 階段 | 精確檔案 | 作用／預期 postflight |
| --- | --- | --- |
| 0 只讀 | preflight.sql | 目標、R7 catalog/ACL/gate/history、W1 absence、default ACL 核對；無 mutation |
| 1 安裝 | install.sql | 新增五個 W1 public tables、invoker view、兩個 public invoker RPC、專屬 private helpers/gate；所有 API ACL closed；gate false／未 enrollment |
| 2 唯讀授權 | enroll-readonly.sql | 操作者私下綁定既有 verified actor/org、一個新 product UUID；只插入明示合成的產品／市場／來源；給 authenticated RLS SELECT 與必要 helper，不授權 W1 mutation |
| 3 限時啟用 | enable.sql | 單一既有 Owner／org／product／source v1；一次窗口、上限 1 小時、最多 2 answers＋2 reviews；只此時 grant RPC/impl EXECUTE |
| 4 關窗恢復 | disable.sql | 關 gate、撤 public/anon/authenticated/service_role 對 W1 mutation wrappers/impl 的 EXECUTE；保留資料、RLS SELECT、回條及歷史；不碰 R7 |
| 每階段只讀 | postflight.sql | 核 W1 gate／ACL／counts 與 R7 仍 closed、1/1/2；與 expected-before/after 比對 |

安裝有 transaction preflight：postgres、現成 Auth/member invoker view與RLS、既有 SELECT、R7 closed、W1 不存在、無危險 default ACL；不自行修理依賴。所有資料寫入僅允兩 RPC，gate row lock→request lock→product lock，最後 DML 後再次核到期／權限並原子更新 counter。直接寫表、跨 scope、viewer、過期或配額耗盡拒絕。精確 replay 也需仍在可用窗口與配額內；窗口關閉／額滿後靠 GET receipt 恢復，不重送 POST。舊 review 只當歷史，不能確認新 fact/source。

關窗在自身交易 commit 時生效，會等待已被 gate 接納的交易結束；先進入關窗的交易會阻擋後來的 writer。到期中途等待者在最後檢查 rollback 全筆。不要宣稱關窗能撤回已提交的歷史。enable 拒絕重開已消耗的窗口；延展／再開須另包，不能重設 counters 或 expiry。

## f403 原授權封套（保留歷史；已完成階段不得重跑）

原 Reviewer 通過及同 HEAD CI 完成後，由父整理**一次具體 action-time 授權**，包含：

1. 本候選完整 commit、SQL/static manifests；目標上述既有 Supabase project；既有私有站的確切 deployment/site 身分及 US$0 配額證據。
2. 私下可核對的 existing Auth user UUID、既有 org membership／owner、唯一新 product UUID；不新建會員／權限。不含真產品／市場／來源事實時仍使用檔案內 synthetic fixture，不假填商家資料。
3. 依階段指定完整 SQL 與 SHA-256；`w1.actor_id`、`w1.organization_id`、`w1.product_id` 的確切私下綁定，以及 `w1.expires_at` 的绝對 UTC 截止（<=1h）。參數 binding 與批准一起保存，不能只批准模板後自行選人或延時。
4. 正式 private origin 的 **exact `/w1-workspace`** callback 新增；保留 `/r7-workspace`。所需現有 publishable key 僅由既有配置供應，不建立 secret、不取 service key。任何 callback/Auth 變動及真人登入另遵原批准檢查，不由 fixture 代替。
5. Static **additive route map**：`dist/index.html` → `/w1-workspace`；其餘 manifest 檔案 → `/w1-assets/<name>`。既有 R7 routes/bytes 保留，不以這個只有 W1 的 dist 覆蓋整站。若主機只支援整站 replacement，先用既有部署機制提出包含 byte-identical R7 的完整候選並獨審，不能直接部署本 dist。
6. 本 repo config 永久預設 `key/redirectOrigin/productId=null`、`accessEnabled=false`、`writerEnabled=false`。審後部署前出具完整config/bundle hash；**首次登入前**即可將固定UI capability writerEnabled=true（須搭配新status reader）。初始、開窗、關窗皆由同session DB GET控制，不能靠切換config/reload接續。關窗靠原disable，client仍可讀status並保持唯讀；現有frozen/R7 config不改。
7. 授權內明列階段0→1→2→只讀登入→3→限定操作→4→fresh-login readonly readback，以及任何失敗／截止的關窗撤權動作；**包含 cleanup**，不將關窗當成未批准的臨場操作。父與 Owner 的批准不由此 README 取代。

f403首次交審時仍缺部署身分、quota及私下bindings/callback批准；此歷史欄位不取代父後續批准、已完成enrollment與只讀Site回條。本次新增reader/UI仍是 **待獨審的候選**，不能憑原階段批准自行套用或更新入口。父可沿既有 connector 查證與保管私有回條，不要求 Owner 日常搬檔或逐個檔案批准。

## 停止／恢復

preflight drift、hash 不符、已有 W1、wrong membership、Auth 錯誤、超額／逾期、unknown SQL／POST 回覆：停止新增 mutation。先以相同 project 的 catalog、postflight、原 request GET reconcile，不 drop/reset、重建、換 request 或盲 retry。安裝已生效不重跑；只有 phase2 完整成立才討論 phase3。任一部分未確認不宣稱不存在／未套用。

在已批准的 cleanup envelope 中執行原 `disable.sql`，核寫入 ACL 已撤、gate closed、資料／R7 保留；過期自動拒寫不等於物理 grant 已撤。前端同頁GET核對server closed，維持既有身分 SELECT；exact receipt／history readback。unknown 操作只能同頁原 request GET；reload 後 pending tuple 遺失仍是原 P3，沒有新增自動 replay 或跨頁持久化。

## 隔離驗證與交審證據

```sh
node supabase/drafts/product_fact/pilot/build.mjs
node delivery/w1-private/build.mjs
node --test delivery/w1-private/adapter.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/w1-private/verify.mjs
```

CI 使用已安裝的 Playwright browser，毋須最後一行的環境變數。沿用已 pinned 的 PG17／GoTrue／PostgREST fixture；owned disposable Docker internal network、synthetic accounts、loopback/native requests，測試結束清除 owned 資源。測試頁雖使用 pilot-shaped URL，所有 browser routes 被攔截到隔離 native service；未連 hosted。`resetWindow` 只存在測試檔，禁止入部署包。

涵蓋 manifest/default-zero-network、Auth/member拒絕與舊回覆隔離、確切 callback/不自動寄信、原生 Owner/viewer/foreign、scope/直接寫表零 delta、兩次各類上限、deadline最後DML回滾、gate關閉併發、撤權後native新JWT讀回、1280/390正式無角色選單頁的Save/Review/logout/fresh context/readback及readonly、R7 catalog/ACL/policies/membership/gate/history逐位不變。

證據 `/tmp/w1-pilot-evidence.json`、`/tmp/w1-pilot-1280.png`、`/tmp/w1-pilot-390.png`；CI artifact `w1-pilot-evidence`。具體執行結果、完整HEAD、run/job/logs與原 Reviewer 裁決由交審回條提供，不能在 CI 未完成時預稱 PASS。
