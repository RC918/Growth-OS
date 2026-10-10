# Growth OS｜專案進度

更新：2026-10-10（UTC；歷史段落保留原時區）。本頁是工程證據快照；產品路線唯一依據為 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)。[舊進度快照](PROJECT_STATUS_歷史_2026-10-02.md)完整保留，其舊 next step／帳號狀態不作目前判斷。

## 當前授權與基準


### 2026-10-10 W2 準備：W1 相依版本接既有發布預覽（交原 Reviewer）

最新父派工接續 Owner 16:37:52 UTC「先繼續推進吧，登入的事情等恢復再說」。本包起點 `feat/private-host-bootstrap`／`0ab9a7b49f42e61d3b11b6642f8490e8277a6f37`／Draft PR28，保留並接續本輪未提交接線，不重播PR19初始化。前包W1真人兩版保存／確認與關窗已完成；此為父轉交及先前讀回證據，本輪不重查遠端。真實fresh-login仍延後／未驗證，不能稱全PASS。下方W1候選／待部署段落為歷史階段紀錄。

**Core可見增量。** 從W1的fact→draft→確切Review接入既有publication preview，顯示本版描述、來源快照與上一草稿差異、版本依據和分項阻擋。提供免登入、六情境synthetic本機入口，桌機／手機可操作。上一草稿不是現網原文、Review不是發布授權、未知擷取與發布時間明示；不造title/meta，不調publisher，不發布。細節與Reviewer獨立命令見 [W2準備交付](prototype/w1-publication/README.md)。

**驗證迴圈。** PLAN/CODE、20項contract／既有預覽及adapter必要回歸、既有build產物14檔hash、實際RUN／DOM／1280與390共4組、登入transitive module graph 14案適用；弱斷言已改以正式路由DOM驗唯讀、Save/Review disabled、新版及阻擋，並驗失效清空／refresh恢復／logout late response。scope、membership、wrong org/product/market/channel、舊Review及來源衝突均隔離測試。DB/SAVE/真實Auth fresh-login不適用此readonly增量，未重跑；同HEAD CI與logs另隨交審回條，未先宣稱通過。既有自動CI不降級，僅新增本slice局部驗證及artifact。

**必要P2修正。** 首次221c149兩份CI同於frozen預覽模組hash失敗；已讀實際logs，恢復共用原檔bytes，改由既有W1 build派生專用呈現，未動frozen manifest或降低測試。frozen單項與20項contract重新通過；再驗受影響browser路由與新HEAD CI。

**四層與邊界。** 已實作＝唯讀接線／復用UI／隔離示範；已測試＝局部synthetic與實際DOM；已部署＝本包否；目前可用＝executor本機入口。runtime config／Auth／R7／SQL不變，無遠端DB或Live Sites改動、不開W1/R7 gate、不寄信、不呼叫模型／新增費用。既有P3 debt沿delivery README保留。本次是Core preparation進度，不等於真W2單頁發布或Measure完成；交原Reviewer，Primary不自行APPROVE或開下一包。

### 2026-10-10 W1 登入 bootstrap failsafe 必要 P2（待原 Reviewer）

接續已審 b8984ef2，Owner 回報寄信無反應。正式資源 HTTP/MIME/import closure 已由父核對，Owner runtime 根因仍未知；隔離 module 失敗／停用 JS 可重現舊版按鈕仍可按且沒有回饋。新候選只補 HTML 預設 disabled、初始化／失敗／noscript 提示與同來源獨立 entry catch；boot 成功才解鎖，移除不必要 top-level await 作相容性防護。CSP/R7/Auth/DB不改，不真寄信；原郵件額度 unknown、兩封上限及16:00UTC截止不重置。實際路由1280/390含mock OTP與四種初始化失敗共14案，相依同 session native回歸及同HEAD CI證據另交原Reviewer；不得把failsafe改善當成Owner原runtime根因已解。新增entry檔須納入完整composite，見delivery README。

Owner同輪明確要求改善輸入框／寄信按鈕緊貼：W1專屬生成CSS保持16px間距／至少44px觸控高度，390px滿欄CTA；含loading文字與aria-busy、DOM距離及截圖驗證，R7共用CSS不變。1768092初次PR CI的隨機UUID含`999`既有測試誤判，已依logs分類P3並有因重跑；完整債與限制記delivery README，不擴產品修復。

### 2026-10-10 W1 同 session 開窗接續必要 P2（只準備，待原 Reviewer）

父在交Owner登入前識別 f403e50 的 immutable writer flag／boot Viewer fallback 迫使重載，可能消耗第三封信。原hosted install/enrollment已完成、writerclosed；本輪不重跑SQL、不動hosted資料／Site／Auth。新Core只修最多兩次Owner登入的接續缺口，不擴原P3。

新增独立 `supabase/drafts/product_fact/pilot/status-read.sql` 與hash：依native Auth、既有membership、單actor/product/source限縮的只讀STABLE helper/public invoker GET；不改已審原install/enroll/enable/disable bytes，無表SELECT擴權、Auth權限或mutation grant。W1 adapter/UI將固定UI capability與DB讀回分開，Owner不再假作Viewer；同頁明確GET狀態後可操作、關窗回唯讀，每次mutation先GET再由原gate最終裁決。GET失敗或closed不送POST，未知POST仍走原pending讀回；token記憶體、R7不變。

PLAN/CODE、contract/build/import closure、實際native PG17/GoTrue/PostgREST、DOM與1280/390適用：10項adapter及12組native/UI PASS，兩次Owner session完成readonly→同document/session開窗讀回→Save/Review→close→fresh-login readonly，無中間登入/OTP/storage；狀態讀取前後business/gate snapshot不變，viewer/foreign/anonymous隔離，失效/錯配/舊response拒絕；receipt401後狀態核對不能解除pending。原R7 catalog/functions/ACL/policies/member/gate/history全數不變。真SMTP/Site/hosted新SQL未執行、不是PASS。完整步驟/首session有效性前提/停損見delivery README；父審後在首封信前更新composite及單獨reader，兩封額度和16:00UTC上限不延展。

已實作＝本候選；已測試＝隔離；已部署＝本修正未部署；目前可用＝executor驗證，原入口維持父的closed/read-only部署。exact HEAD/同HEAD CI另交回條；Primary不自行APPROVE，交既有Reviewer，後續remote reader需action-time審核。


### 2026-10-10 W1 CLOSED pilot 啟用候選（未部署，交原 Reviewer）

本 Core 接續 `004afe78e553a6eaa908b5a96ff0ff4c7054d986`。父確認原 Reviewer 已獨立核兩份同 HEAD CI logs，24 個讀回回歸與 9 組 native DB/Auth/UI PASS，APPROVE_WITH_DEFERRED_DEBT，原 P3 保留。當前 branch `feat/private-host-bootstrap`；不重播歷史 PR19 checkout，不開其他 task、不開 W2/W3。此次只準備封閉部署／授權候選，沒有遠端 DDL/grant/Auth/callback、部署、寄信、真登入或原站修改。

**PLAN／CODE。** [完整候選與後续授權封套](delivery/w1-private/README.md)。正式 adapter 復用既有 R7 native Auth＋DB membership 驗證，無 synthetic actor selector；既有 R7 完全不改。新增 `/w1-workspace` 候選與獨立 `/w1-assets/` additive route map、default CLOSED config及 allowlisted/hash 靜態包；此新 exact callback 尚未批准／設定。pilot SQL 從已接受 W1 派生，僅新增 W1 五表、invoker view／wrappers、private gate/helpers，讀取既有 R7 membership，不另建 general org 系統。安裝、唯讀 enrollment、單一actor/org/product／source／最多1h／2 answers＋2 reviews啟用、撤寫权恢復分檔；原 isolated runner/enable 不進部署包。

**只讀目標證據。** 2026-10-10 約12:52 UTC 原Supabase connector確認既有 growth-os-pilot／wqepyttadrcnphtyjpjy健康、Free plan、PG17.11、DB 11,515,571 bytes；W1 schema/relations/functions不存在；R7 membership invoker/RLS/readonly ACL如預期；R7寫函式ACL僅postgres、gate=false/expired、history=1/1/2；unsafe future table defaults=0。完整 preflight SELECT在候選內，可重跑比對。剩餘storage/egress/Auth/hosting quota未知，不能宣稱Free證明零費用；不創付費資源。US$0新增費用、model0仍是限制。

**UNIT／BUILD／RUN／DB/Auth／DOM／desktop+mobile。** 新adapter 6項contract：closed零網路、wrong config/link/user/membership拒絕、verified user過濾membership、scope/readonly、過期/logout/舊Auth回覆隔離、exact callback/一次OTP不重寄。封裝核hash、固定allowlist及transitive import closure。原生PG17/GoTrue/PostgREST 11組含native Owner/viewer/foreign與直接寫表零delta、固定配額、exact replay、最後DML等待逾期全筆rollback、關窗併發與撤權後新JWT讀回；實際Chromium1280/390正式頁save/review/logout→fresh context→native login→exact readback、readonly/viewer、無storage/overflow；R7 catalog/函式/ACL/policies/membership/gate/history前後不變。證據 `/tmp/w1-pilot-evidence.json`、`/tmp/w1-pilot-{1280,390}.png`，已目視兩尺寸。CI新增同樣檢查與 `w1-pilot-evidence` artifact。最終exactHEAD/run/job/log另隨交審回條，尚未沿用旧CI宣稱新包成功。

封裝驗證初次暴露既有Auth import closure缺件，根因是只列直接依賴；已補完整closure並加靜態依賴檢查，未改Auth/R7模組。環境沿用 `/usr/bin/chromium`，沒有安裝／登入新服務。保持先CLASSIFY必要封裝阻塞、修根因再重跑受影響的驗證迴圈。

**VERIFY／限制。** 上述各點均適用且以隔離native及真DOM驗；hosted save／Auth callback／真人終驗未執行，不是PASS。已實作＝closed candidate；已測試＝隔離；已部署＝否；目前可用＝executor可重現。尚缺具體private site/additive route證據、quota、私下已驗actor/org/product/config綁定與正式callback/action-time批准；不得把候選模板當可自行選參數的部署許可。恢復包能關W1 gate、撤新寫權、保留資料讀回，R7不動。原P3仍為document內pending，reload不保存，不擴修；已知technical debt沿舊記錄。本包CoreProgress是從隔離切片推進到可獨審的正式adapter＋封閉有限gate，非商家已可用／成效。交既有Reviewer，Primary不自行APPROVE。


### 2026-10-10 W1 Review 必要 P2：POST 與讀回錯誤分階段

原 Reviewer `01a125b7` 對 `94e0c5cb997d7d4b6941d11255474b4de00a0ff0` 判 BLOCKED：POST 200 後 receipt GET 401 被共同 catch 誤當寫入拒絕，清掉 pending 並重新開放 Save。根因是 mutation 與後續權威讀回共用拒絕分類；不是後端交易失敗。此包只修此必要 P2，不更改 SQL、runner、R7、frozen、remote 或產品範圍。

修正 `product-fact.mjs` 以 POST／readback 階段分類；只有 POST 本身明確 400/401/403/409 拒絕才能解除 pending。讀取錯誤保留原 kind/body/request 及 POST acknowledgement；精確 request/org/input/result 核對後才恢復，錯配回條仍保持鎖定。頁內 logout／login 保留 pending 並固定原測試身分，登入後只允 GET 原 request，無自動重送。tuple 仍為頁內記憶體，不宣稱跨頁面 reload 保存。

新增 `prototype/product-fact/readback-regression.mjs`：實際 Chromium UI、synthetic transport，1280/390 × answer/review × receipt401/403/409/500、state401、history500 共 24 例。每例核 POST200 後 pending／恢復入口保留、未顯示「操作已拒絕」、Save 不重啟、登出重新登入不 replay、錯配 receipt 不能解鎖、精確 receipt 成功且全程僅一個 POST。既有 W1 原生 PG17／GoTrue／PostgREST／桌面手機 9 組回歸亦 PASS。CI W1 step 加入此直接回歸；其餘既有 assertions 不降級。新 exact HEAD／CI 另附交審回條，舊 W1 CI 不冒用為新版本 PASS。交原 Reviewer，未自行 APPROVE，仍僅隔離可用、未部署／未開遠端。

### 2026-10-10 W1 產品事實→相依成果（隔離實作，交原 Reviewer）

父轉達原 Reviewer turn `01a125a9` APPROVE W0 exact `99d6e0e1fe9c9b99e08433970c83ec3f28c2260e`，並明確派工系統設計第 6 節 W1。該 HEAD 的 push CI `38049180064`／PR CI `38049181802` 現已同為 SUCCESS，已取實際 jobs `114204684598`／`114204689415` logs，末段 desktop/mobile PASS。以下 W0 與 R7 紀錄保留為原階段證據，不能當作 W1 的 CI 或驗收。

**PLAN／CODE。** 原分支 `feat/private-host-bootstrap`，起點 clean／PR28 同 W0 HEAD；不切分支、不新建 task。新增獨立 `product-fact.html`／ES module／小型樣式、五表與兩 RPC 的 closed SQL 候選、沿用既有 native fixture 的 loopback runner／驗證器，以及必要 CI step。沿用 org membership／RLS helper、原生 GoTrue／PostgREST／PG17、既有 UI 樣式；一般答案不能塞入固定 R7 或 frozen workspace，故使用必要獨立介面，未放寬原契約。可操作入口與命令見 [W1 交付說明](prototype/product-fact/README.md)。

**商家可見結果。** 同成果頁選產品／市場，戶外使用未知可略過，保留 unknown 且無確認者；回答後保存不可變 scoped fact 及依賴該版的草稿，舊確認即不再有效。已回答不重問，可主動修正。來源 quote／URL／version、產品／市場／渠道及確認者／時間保存，merchant confirmation 不冒充外部驗證。來源矛盾保留答案、禁止確認；不改其他產品。UI 就近說明答案用途，確切版確認與發布分開。所有產品、引用及規則候選明示 synthetic／非真 AI 理解。

**必要驗證（本機 PASS）。** `node prototype/product-fact/verify.mjs` 在 owned disposable 原生 PG17／GoTrue／PostgREST 上完成 9 組 SQL/Auth/UI 檢查：答案＋草稿＋request 同交易；最後一步強制失敗零部分寫入；不可變歷史、exact replay／changed replay 拒絕；owner/viewer/其他 tenant、anonymous／forged JWT 與直接寫表拒絕；併發 Save 一勝一拒／Save-Review 序列化，舊批准不能變成當前有效；來源漂移／衝突與產品／市場隔離；native logout、refresh 撤銷、新 JWT exact readback；1280／390 真 Chromium 的鍵盤略過／回答／保存／確認、lost upstream reply 後 GET-only reconcile、logout→全新 context→原生登入→精確取回、不重問、修正失效、409 保留輸入及讀回恢復、viewer readonly、無 storage／水平溢出。不是 mock DB、不是 hosted 驗收。最終 scoped frozen RC hash check 1/1 PASS，未跑無關手動全套。

**可核查輸出。** `/tmp/w1-product-fact-evidence.json` 與 `/tmp/w1-product-fact-1280.png`、`/tmp/w1-product-fact-390.png`；已目視桌面／手機。CI 追加相同 W1 native/UI step 與 artifact；最終 commit／remote／same-HEAD CI 隨交審回條，未先宣稱 PASS。既有 workflow 其餘步驟不降級。

**VERIFY 適用性。** PLAN/CODE、contract、實際 loopback RUN、DOM、桌面手機鍵盤、DB/Auth、SAVE→logout→fresh session→login→readback、tenant/permission 均適用並有上述證據；原生静態 ES modules 無獨立 build，不用 echo 假替代。SQL catalog 核 RLS／invoker view／private definer＋public invoker wrapper／閉合 anonymous與service ACL，未對遠端跑 advisors。原子失效由 `w1_state.review_valid` 的 current fact/draft/source 依賴判定，歷史 review row 仍保留；W2 尚未實作，不能把歷史 row 存在當發布批准。

**四層與限制。** 已實作＝W1 可操作隔離垂直流程；已測試＝上述原生隔離與 synthetic UI；已部署＝未部署；目前可用＝有既有 pinned images 的 executor 可依 README 啟動本機 runner 操作。DB 跨 session 保存，但 runner 停止會清除 owned 容器／資料，不承諾跨 runner 重啟或正式長期服務。沒有真模型品質驗收、live grant/migration/Auth 修改、遠端 writer、原站發布、W2 量測或 W3 排程。新增成本 US$0／remote model call 0，無新 secret、持久權限、merge、force push；R7 writer 仍 closed。目標環境開放由父另整理精確範圍，Primary 此包到此交原 Reviewer，不自行 APPROVE、不擴下一包。

### 2026-10-10 W0 持續服務文件對齊（交原 Reviewer）

依 Owner 11:31:22 UTC 附件任務與父後續派工，只做 W0 與 W1 提案。輸入為父透過既有任務訊息轉交已核讀的 `Growth_OS_Optimization_Report_Dot_2026-10-10.md` 完整第 1–15 節；父稱正式 Library version 0、26,651 bytes。Primary 本機正式 materialize 首次及一次有界重試皆 generic download failed，未取得檔案，不聲稱本機下載／hash 驗證；全文訊息未截斷，無須再搬運或換下載 route。

起點／PR 核對：`feat/private-host-bootstrap`、`d62805a15cdafb1976b420dad1cec42e4d150bf2`，PR28 open/draft 同 HEAD，base `feat/private-site-recovery`。開始僅本檔 R7 結案 checkpoint 未提交，原文保留納入本次文件提交。沿用原 Primary／Reviewer，不新建 task，不重播 PR19，不整批合併候選。

沿用藍圖 v2.0／設計 v0.2，更新日期與章節；同一 URL→First Useful Result→Review→Publish→Measure 主線，補必要商家校正、答案範圍／版本／來源／依賴、草稿新版／舊批准失效、觀察→處理→驗證及 A–D／W0–W5 正式路線。具體 W1 復用映射與必要驗收見[設計第 6 節](docs/Commerce_Growth_系統設計_v0.1.md#w1-proposal)。這是提案，不是 W1 實作；W0 結束交原 Reviewer，父再派工。

原站為 Owner 自有伺服器，等待正式後台／部署路徑，只阻塞原站發布，獨立 docs／隔離普通工程不阻塞。歷史英文 R7 與目前中文頁有差異，既有 v1 確認不授權現頁發布。R7 已接受成果不重做，server/client writer 維持關閉，不動固定 validator、frozen 證據或 remote。

四層狀態：**已實作**＝本包只有三份文件增量；W1 答案依賴未實作。**已測試**＝文件 diff／範圍、版本與相對連結核對，無產品測試要求；自動 CI 若觸發則按本次 exact HEAD 另附終態與 logs，不移用 d628 的成功。**已部署**＝本包未部署。**目前可用**＝現行文件與 W1 可審提案；沒有新增商家可用功能，R7 只沿用下節接受範圍，原站未發布、商家成效 unknown。

驗證迴圈適用：PLAN／CODE 對應文件範圍與編輯，VERIFY 為一致性／連結／非秘密 scope。UNIT、BUILD、DOM、桌面手機 E2E、DB/Auth、SAVE/logout/fresh login/readback/tenant 均本次不適用（無 runtime 變更），不是 PASS。W1 才依其變更跑必要真路徑。沒有新費用、模型、secret、遠端 SQL/grants、Auth flags、merge、部署或原站修改。最後 commit／non-force push／PR 同 HEAD／CI 由交審回條提供；原 Reviewer verdict 待定，Primary 不自行 APPROVE。

本包為 Owner 明確授權的一次文件 Maintenance，Core 新功能進度 0；R7 結案為已接受的前包成果，不拿重驗當新進度。下一候選 Core 僅 W1 的一項必要事實保存→相依新版→舊批准失效→隔離新 session 讀回→用途可見；不開 W2–W5，不另造治理框架。

### 2026-10-10 R7 保存包結案安全 checkpoint

本包已完成，停止施工，不自動啟動下一包。程式基準 d62805a15cdafb1976b420dad1cec42e4d150bf2；同 HEAD push CI 38029483072、PR CI 38029486369 均 SUCCESS，實際 logs 已讀：30 contract/SQL、7 native PG17、封裝及callback 1280/390 PASS。

依父轉達最終原 Reviewer APPROVE：真實 R7 一次保存、確切第1版確認、關窗後 fresh-login readonly readback 已驗收。Reviewer 2026-10-10 09:46:08 UTC 獨立遠端核對仍為 exact v1、versions/confirmations/audit=1/1/2、gate=false、expiry=-infinity；writer維持關閉，不重新enable、不延長。本人受RLS限制的讀權與原紀錄保留；本次更新未另查遠端或執行SQL。

證據界線：真人新登入採父目視三張圖、發出流程後收到回傳、memory-only程式行為及獨立DB讀回的綜合證據；不宣稱連續錄影、零人工、自動代登入或已發布原網站。SMTP/私人Sites登入仍有人員必要環節。私人Site identity/URL、Owner email/UUID、token及完整私有操作回條不記入本repo。

下一包僅建議、尚未實作：以近端文案澄清「保存後checkbox清空，需再次核對並勾選才確認」；日常synthetic回歸沿既有fixtures，真人僅保留正式Auth與必要終驗；關窗平台批准前先給中文動作/target/完整SQL/hash/影響，再等action-time授權。此類改善限US$0、無新secret/權限/model call；不得改tool/route繞批准或代Owner勾選/確認。父另選定下一工作，本checkpoint不授權新工程。

### 2026-10-10 Callback canonical／狀態／期限必要修補

同一私有workspace改用canonical `/r7-workspace` callback，加入驗證中／缺callback／timeout／success、有界Auth與membership GET、一次hasharrival消費與舊請求隔離。保持token僅記憶體、writer=false；不發真信、不改SQL/權限。父sentinel只證signin return_to不含fragment，未證postlogin遺失的完整因果；本修補不宣稱跨Sites Auth恢復session，需先同一收信瀏覽器private登入。14 JS tests與callback mock1280/390 PASS；交原Reviewer，正式信件仍由父控額度與操作。


### 2026-10-10 首次登入前唯讀 enrollment 候選

父選定必要順序修正：先 verified invite identity 的 read-only membership setup，待本人登入成功才開始既有最多1h writer window。新增 enroll-readonly.sql 與隔離負測，未執行此候選於遠端；不含真actor/org。新＋既有PGlite 16 PASS，dist與三份原審SQL bytes不變，交原Reviewer。正式migration回條僅由父私下保存，本repo不記私人部署／身份資訊。


### 2026-10-10 R7 私有登入／保存 artifact

沿 a84a90e 準備獨立13檔靜態包，保留旧六檔核稿bytes。登入／讀回與writer flag分離，預設key=null/accessEnabled=false/writer=false。無真Owner/org猜值、無遠端schema/Auth寄信/部署；SQL三hash不變。父端處理SMTP/recipient/DataAPI/正式身分與私人callback，公開repo不含私人部署資訊。詳見 [artifact及非秘密配置清單](delivery/r7-private/README.md)。12 JS contract、13檔packaged mock E2E 1280/390涵蓋新context停用writer後exact readback；VERIFY交原Reviewer，不擴下一Core。


### 2026-10-10 R7 期限鎖後複查（離線必要修正）

6502b3 已獲原 Reviewer APPROVE_WITH_DEFERRED_DEBT，兩 P2 解除。本包只補 advisory lock 等待後 gate/expiry 重驗、gate SHARE 與 disable UPDATE 序列化、返回前到期回滾。既有 PGlite 8 子測試及原生 PG17 7 個多連線負測通過；proposal/disable hash 更新、enable bytes 不變。無 remote schema/ACL/Auth/secret/部署；未知 Owner/org 未寫入 enable。[證據與併發語意](supabase/drafts/r7_intro/README.md)。

CI 補正紀錄：50f9c31 的 push run 38021576444，R7 contract/SQL 20 PASS、保存 UI 1280/390 PASS，最後副本驗證因 shallow checkout 無歷史基準物件而失敗。改為由 exact 141b114 原 bytes 計算的固定 SHA256，仍驗原 CSS/contract/JSON 與僅允許指定兩處差異的 review module，不略過 bytes assertion；產品與 SQL bytes 不變。

### 2026-10-10 R7 Review BLOCKED 必要修正與最小 SQL 候選

d3c8cb1 的 push/PR CI 38020573815／38020576699 terminal failure：workspace source/mirror 不一致；Reviewer 另證明 unknown save version=99 可被誤接受。保留失敗紀錄，修正鏡像與完整 expected state 核對，新增負測；未降級 assertion。最小 proposal/enable/disable SQL 在 PGlite 真 PostgreSQL/RLS 隔離驗證，預設讀寫 ACL 和 writer 關閉。新增 introOnly 獨立工作區入口，避免 empty pilot 需整套 dashboard；key=null、client flag=false。未動遠端 schema/ACL/Auth/secret/原站。[精確 SQL/hash、驗證、preflight 與啟用/停用](supabase/drafts/r7_intro/README.md)。ee92009 CI 38021395960/38021398920 又揭露 frozen RC hash 保護；已保留 manifest/assertion、恢復原 workspace 三檔及鏡像，R7 使用專用 adapter/入口。最終 exact HEAD CI 終態另交審。

### 2026-10-10 R7 介紹保存接線（僅離線／隔離，待原 Reviewer）

從 b83b1fb 完成專用 R7 contract、既有 workspace API/UI 接線與近端確認 UX。真保存開關 false，拒絕舊 staging；新 pilot 空 schema 不當成已可用工作區。7 項新 contract、1280/390 模擬再登入讀回、原核稿副本與 typed workspace 回歸通過。無真 DB/Auth/RLS 或跨裝置驗收；本輪無 remote migration、權限、secret、部署、模型或費用變更。[範圍、證據及最小啟用依賴](prototype/intro-trial/R7-SAVE-CONTRACT.md)。私有站網址與存取 metadata 不入庫。

### 2026-10-09 R7 商家頁內 Review 切片（離線通過，待原 Reviewer）

Owner 17:38:54 UTC「繼續推進」後，父明確選定既有介紹入口的最小離線 Review 包；起點 `9481d87c4200ee487dc9fcf354ed528fea84daba`、原 `feat/private-host-bootstrap`，開始 clean。已完成的 R7 生成／獨立內容驗收不重做；本包無新模型、secret、DB、Auth、merge、Vercel 重連或 production 部署。

**可見成果。** 原 `/service-result.html` 首屏直接讀同源固定 `intro-r7.json`，展示真 R7 原文／繁中候選／模型理由／原文引用／來源 URL，以及可展開的 source version、run、回條、Reviewer APPROVE；不用使用者選檔，不偽造完整來源 report，也不放寬原 static_subpage 的 workspace Save／handoff／發布限制。生成時間 `2026-10-09T17:35:33Z` 與「既有 R7，非本頁新生成」明示。已驗候選唯讀、可複製；頁內確認與獨立 Reviewer 裁決分開，醒目標「不跨 session 保存、未發布、未量測」。

**真資料與確認契約。** JSON 是正式 job `113944733675` 的 public frame，原 payload 和 frame SHA256 `d14cf60a8c34cd648d95e8ed3f34bd3254e8a8def098cfebca9c67fcd60258cd` 保持；候選版本 SHA256 `3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04`。新 `intro-r7-review.mjs` 只核固定 frame／run／main／source commit／source URL+version／result hash 與既有 artifact 契約，不重新生成或改寫候選。確認只在本頁記憶體綁定候選 hash 與來源；來源輸入／重新讀取候選／離頁／bfcache 返回即取消，刷新及新頁不恢復；來源或內容被竄改即拒絕展示／確認。DOM 使用 textContent，不執行資料內 HTML；GET 同源靜態資料、不帶 credentials、不跟 redirect。既有三欄來源 report／DB Review 仍維持原權威界線。

**本機真驗證。** `node --test prototype/intro-trial/r7-review.test.mjs prototype/public-audit/first-result-review.test.mjs prototype/internal-rc/contract.test.mjs`：18/18 PASS（R7 六項＋原 Review 六項＋frozen/RC 六項）。`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/intro-trial/r7-review.e2e.mjs`：1280／390 真 Chromium、loopback HTTP、真 R7 檔案、DOM 全文／引用／版本、鍵盤勾選確認、clipboard 成功及拒絕 fallback、44px 按鈕、來源改變失效／返回需重勾、刷新與離頁返回、bfcache event、錯來源 failclosed 全通過；無外連、POST 或 browser storage 寫入。截圖 `/tmp/r7-review-1280.png`、`/tmp/r7-review-390.png`，已目視手機無橫向溢出。

原 `product-source-ui.e2e.mjs` 1280／390 全回歸 PASS：舊商品每尺寸22次下載、service/software/static_subpage、手動候選匯入／套用／修改／複製與舊稿保護維持；無新 remote/storage/error/overflow。沒有拿 unit PASS 代替 UI；本包不涉及登入或 DB 變更，未跑／未宣稱 hosted Save、跨 session 權威 Review 或真站發布。既有 CI 增兩個相同 R7 contract/UI checks；exact 新 HEAD 的 CI 與原 Reviewer 結果另隨交審回條，不預先標 PASS。

**交接。** 只修改必要 UI／靜態非秘密結果／fixture／tests／既有 CI 與本 status，原 R6/R7 已消耗 workflow/ref 不動。最終 commit/non-force push HEAD 與 clean/readback 以完成回條為準。下一步僅原 Reviewer 審同 HEAD；本切片完成即停，不擴 DB 保存或正式商家網址。要對外部署這個入口、跨 session 保存確認或把文案套用網站，仍需父集中精確範圍與相應發布批准；離線可用不是已部署。


### 2026-10-09 R7 完成交付 checkpoint（有界生成 → Review → 交付 PASS）

本節是當前交付狀態；以下 R6 與修補階段段落保留為歷史快照，不再作目前 pending 指令。R6 原品質 BLOCKED 不改寫為成功。本包已完成，不自選下一包、不新增模型請求／功能／部署；零人工與 8 小時無人值守 **未通過、未宣稱**。

**正式執行及版本。** Owner 於 `2026-10-09T17:16:10Z` 批准窄整合與一次實測；原 Reviewer 核准 PR30 exact head `6ed7d0d201d7c4210db886221c8252292102ca6a` 後，17:27:50 UTC 合併至 main `0d6a4d231f823ba8602cecdac8018153324eaa43`。只新增三檔、未 merge PR28，Vercel Git 維持斷開、無 production 操作。R7 run [37967220375](https://github.com/RC918/Growth-OS/actions/runs/37967220375)，RC918／workflow_dispatch／attempt 1，offline、reservation、generation 三 jobs SUCCESS；generation job [113944733675](https://github.com/RC918/Growth-OS/actions/runs/37967220375/job/113944733675)，17:35:33 UTC HTTP200。本節執行／內容證據由父正式轉交原 Reviewer 結果，Primary 本次只歸檔，沒有重跑或另下 ZIP。

**獨立驗收與 log 交付證據。** 原 Reviewer turn `01a121bc-499a-74d4-a4c2-c72fb192201f` 已由正式 job log 取得實際全文，真內容＋log 交付 verdict **APPROVE**。Reviewer 獨立計算 public frame SHA256 `d14cf60a8c34cd648d95e8ed3f34bd3254e8a8def098cfebca9c67fcd60258cd`；依核准序列化、log payload 及 immutable reservation 重建 result，SHA256 `fb92927b097885479f2e1c711f17de287753a6f90a33cd55a284e6a17b1b72ff` 匹配。這是正式 log 全文與重建 result 的核對，**不是下載 ZIP 後的原檔 hash 驗證**；本輪未下 ZIP、未要求 Owner 搬檔。artifact 仍是備援出口，不能將未下載 ZIP 寫成已下載。

- source commit：`a20776cdfdb399a5e0b9c4d5a48021155f7b657d`。
- payload SHA256：`35357f8011a8a8c08278c5ef2f592eadeb73822e6441e41f58bd58b2589a2b26`；manifest SHA256：`828fc570ef42cb5e1fea280b935d4605f66b949875df6fe9b1ee20049bcfb366`。
- source HTML SHA256：`7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d`（父轉交 Reviewer 證據）。
- request：`req_d9279209436948a787e1dd39633064bd`；response：`resp_05a51269b6ac8a20016ac925e3832087d280312eab89f714ea`。
- usage：input 369／output 185／total 554；含稅估算 US$0.001164713，`billed=null`，實際帳單未知。新 US$1／累計 held US$7 是預占上限，不是實際扣款，不因成功自行釋放先前預占。

**已交付、尚未套用／發布的真候選。**

> 輸入您的網站與品牌名稱。我們會檢查您的品牌識別，向 AI 引擎提出三個真實買家問題，並顯示應先修正的項目。

引用為原介紹全文：`Enter your website and brand name. We check your brand identity, ask AI engines three real buyer questions and show what to fix first.` Reviewer 核准為忠實繁中、保留原流程與主語，不宣稱搜尋／推薦／流量或其他效果提升。父端已將全文及 verdict 交付 Owner。程式輸出的 PENDING review 標記／原 artifact 不回寫，獨立 APPROVE 由此 checkpoint 引用原 Reviewer 裁決。

**已消耗與恢復邊界。** R7 固定 `refs/tags/intro-trial/2026-10-09-r7` 已消耗，禁止 rerun、再次 dispatch／API、刪除或移動 ref、補造或覆蓋結果；授權原截止 `2026-10-10T04:00:00Z` 與 40 秒餘裕不變，剩餘時間不是重跑權限。R6 全部文件／ref／歷史保持不變。只有既有成果的唯讀核對／checkpoint 保存可接續。

**實際 orchestration 與人工 gate。** 父端完成事件與 read/send_message → 原 Reviewer 正式 log 全文與獨立驗收 → 父端通知 Owner → 同一 Primary 新 turn 恢復原 checkpoint 並保存本節，已實際發生。Owner 仍親自啟動 workflow 並批准既有 environment，不能稱零人工；本輪不用 Owner 貼 SHA 或搬 ZIP。沒有重啟 scheduled controller、另造排程／新 task 或以文件冒執行器。

**持久 checkpoint／交接。** 本節保存於原 `feat/private-host-bootstrap`，本次起點 `a20776cdfdb399a5e0b9c4d5a48021155f7b657d`，只提交 PROJECT_STATUS.md 並 non-force push；最終文件 commit HEAD／remote readback 隨本 turn 完成回條提供，不混同模型執行 main SHA。整合 branch `feat/actions-intro-zh-once`／`6ed7d0d201d7c4210db886221c8252292102ca6a` 及交付修補 branch `feat/actions-intro-once`／`b7aaf67f1e6f725d014ced60f8bb58940410d863` 保留。本輪 diff 檢查與檔案／遠端讀回足夠，無功能變更、不重跑不變測試。Pending action：**本包無待施工項目**；收到父完成事件後結束。若要把文案套用網站，須另定目標頁／版本／操作範圍並取得發布批准，不自行發布，也不將本包 PASS 擴稱 URL→Publish→Measure 或整體產品完成。


### 2026-10-09 R6 交付接續 checkpoint（Owner 16:22 UTC 上傳後更新；BLOCKED 品質，不採用、不發布）

本段是既有狀態檔中的恢復書籤，不是排程或自動執行器。最新 Owner 16:15 UTC 指示的第一個證明包限「既有 R6 結果 → 原 Reviewer → 父端通知 → 原 Primary 恢復」。不新增產品功能、生成、費用、secret、權限、merge 或部署；舊 scheduled controller 保持停用。不修改已消耗 workflow、不 dispatch/rerun/API、不繞拒絕、不要求 Owner 搬檔或貼 SHA。

- 父 thread：`01a0f25c-a8c0-7271-bf72-18411d628009`；原 Reviewer 本輪 turn：`01a12171-ee20-7010-ab80-ada0b775eb91`。只沿用原 Primary／Reviewer。
- 本地 Primary：`/workspace/Growth-OS`，branch `feat/private-host-bootstrap`，HEAD `b901e3474989bd4204c418ce90eafeb4e067d5f3`；本包開始 clean；目前此檔與 prototype/intro-trial/policy.mjs、prototype/intro-trial/intro-trial.test.mjs 為可歸屬未提交修改。base PR28 `feat/private-site-recovery`／`eec7a640c26878a33139179522d495463b7c382c`；不切分支、不提交或推送。
- 保留 worktrees：`/workspace/Growth-OS-actions-intro`，`feat/actions-intro-once`／`cfe365d5b1f40821cae64b3e7591e10e57f17e43`，目前 scripts/intro-once.mjs、scripts/intro-once.test.mjs 未提交；`/workspace/Growth-OS-rc-evidence`，`feat/passwordless-workspace`／`5591bd68798def96c898ea4382239acf02819651`，clean。歷史初始化 checkout 不重播。
- R6 執行版本：main `00c145ab063e2e87fb577e7044ee4713dcb8edbb`（PR29 merge）；既有程式三檔與已審 cfe365d5 完全一致。
- 父轉達原 Reviewer 真讀回：run [37956562518](https://github.com/RC918/Growth-OS/actions/runs/37956562518)，attempt 1；offline/reservation/generation 三 jobs SUCCESS；generation log HTTP200、`COMPLETE_HELD_REVIEW_REQUIRED`、error_code null。Primary 本轮未另取遠端證據。
- artifact ID `11627744854`，名稱 `intro-gha-01-r6-37956562518`，1539 bytes；父轉達 GitHub/log ZIP SHA256 `cfe09c38e9cddc20f3a40f3e8adc67cd52ab90af02d2fc86b19ba121dbb6da40`；result SHA256 `610cdf00d10e91ffc55bacc655769718203cfa6ee38558e8ff53271b59544403`。這些是 metadata/log 身份，尚非下載 bytes 的獨立 hash 驗證。
- 原 GitHub ZIP 讀取曾遭 `Tunnel connection failed: 403 Forbidden`，沒有重試／換路；此為傳輸 403，不再追為 GitHub 授權故障。Owner 16:22 UTC 主動上傳 Library `libfile_a8b7297ee794819190670c374c9d7658`；父端正式 materialize 後實算 ZIP/result SHA256，與上述 GitHub/log hashes 相符。Primary 未下載或自行驗 bytes。
- 原 Reviewer 自身 Library 兩次 generic download failed，未取得 bytes；父透過正式任務訊息提供實際全文後，Reviewer turn `01a1217b-a078-7770-be72-bc8eef1fe869` 完成獨立文字 review，verdict **BLOCKED 品質**。原檔 hash 是父端驗證，不能寫成 Reviewer 完整獨立原檔 hash 驗收。
- 父轉交實際回條：HTTP200；request `req_0bd75021666b41d3a9114e9963f53a13`；live model `gpt-5.4-mini-2026-03-17`；input 261 / output 140 / total 401；含稅估算 US$0.000867038，實際帳單 unknown。
- 真候選原文（保留不替寫）：`Enter your website and brand name to check whether AI engines recognize your brand identity, ask three real buyer questions, and identify what to fix first.` Reviewer 必要缺陷：刪除 We 後 ask 三問題的主體含糊；將「我們檢查品牌身分」改成「AI 引擎辨識品牌身分」，來源不支持且混淆功能。free/no-account 未加入及英文不是本次技術阻塞；Owner 期望中文可用稿，先前中文批准保留。內 R1／外 R6 沿用 schema 不是缺陷。父已告知不採用、不發布。
- 預占 ref 固定 `refs/tags/intro-trial/2026-10-09-r6`，保留不動。舊 US$5 held＋R6 US$1 的預占界線不因 success 解除；實際費用未知。原期限 `2026-10-09T16:16:40Z` 已到，不能延展或重發。

**已實測接續與人工步驟。** 父端完成事件→讀結果→同一 Primary 新 turn 只讀恢復 checkpoint 已真實發生；本輪又收到原 Reviewer 裁決並接續保存。前次讀回 HEAD/branch/dirty 相符，checkpoint 檔 hash `c0945571f3e4e2892602429c433b3f4ad7e004d5270df1e28a2faad1118d5e8d` 為更新前歷史證據。Owner 啟動 workflow、批准 environment、主動搬檔仍存在；完整少介入／無人值守工作包不 PASS。沒有新增排程或執行器，文件只是恢復書籤。持久性限現有 workspace，未 commit/push，未驗 workspace 銷毀後恢復。

**16:27 UTC Owner 指示後已完成的最小離線修正（待原 Reviewer）。** 普通必要 code/tests 已獲本次派工，不再要求 Owner 確認兩檔。`prototype/intro-trial/policy.mjs` 提示明列使用者輸入、服務檢查品牌身分、服務向 AI 問三個買家問題、服務指出優先修正；禁止將品牌身分檢查改成 AI 識別能力或讓使用者成為提問主體。候選／理由要求繁中，引用仍逐字原語；無可支持改善時忠實翻譯並說明限制。未硬編碼已批准中文為模型輸出。新 payload 2334 bytes／SHA256 `35357f8011a8a8c08278c5ef2f592eadeb73822e6441e41f58bd58b2589a2b26`；原 4096 bytes／1500 output／無工具／無保存界線不變。validateOutput 僅核引用 membership 的界線保留；失敗候選回歸明示此檢查無法證明語義品質，仍交 Reviewer。

**交付接線。** 既有 Actions worktree 的 `scripts/intro-once.mjs` 在 result.json 保存成功、artifact-ready 與摘要之後增加 `INTRO_PUBLIC_RESULT` 單行 JSON job-log 出口；不新增服務、API、權限或 secret。白名單投影只有來源綁定候選、receipt、usage、run/版本及原結果 hash，獨立審查狀態固定 PENDING；不展開 raw response、headers 或 errors，literal/base64/URI 已知 secret 均拒絕。單行 JSON 轉義阻止候選注入 workflow command，多於32KiB拒絕；原 artifact 出口保留。readPublicDelivery 用既有正式 job-log 工具回傳文字，核 public frame hash、exact run/workflow/result hash、source/candidate 契約與 usage；截斷、重複、混 run、未知欄位拒絕，不自動套用／發布。父／Reviewer 可直接從工具讀全文，不需 Owner 搬 ZIP。此為新程式的離線已驗接線，不是對歷史 R6 補造 log；正式遠端新出口未執行。

**離線驗證證據。** 原分支執行 `node --test prototype/intro-trial/intro-trial.test.mjs prototype/intro-trial/follow-on.test.mjs`：59/59 PASS，含繁中 synthetic 回覆穿過 runner→保存→source-bound readback，不替寫候選、不重送；提示及安全界線契約、舊unknown/期限/預占拒絕保持。Actions 分支執行 `INTRO_TEST_SOURCE=/tmp/growth-r6-pinned-source node --test scripts/intro-once.test.mjs`：35/35 PASS；測試 source 是由既有本地 repo clone 的乾淨 immutable b901e347，無遠端 fetch。真 loopback 假服務一次模型 POST→fsync 結果→SIGKILL→全新程序禁止 network 讀回→log frame 傳遞同一候選／hash／不改 bytes；fake remote reservation 仍拒 replay。截斷／重複／改 bytes／錯身分／未知欄位／秘密／命令字串案例通過，保留原31項固定R6 guards。兩 worktree diff-check 通過，workflow YAML bytes 未改；沒有真模型、GitHub mutation、CI/Preview、部署或登入。純 Node／內容提示與 log 變更，瀏覽器/DB/Auth 測試不適用，並非產品 UI 整體驗收。

**交審檔案 SHA256。** policy.mjs `3c8e7cadc327f6358cae37c6d35f080708b78ecb43a4cfc42b36d3ea515c7021`；intro-trial.test.mjs `a7e635094dfa96251e049e28db3bc88b3a323b768752d307e848f2ca8162c9d4`；Actions intro-once.mjs `874e40e9e1addbf8ecd62a7054cb9262e16c49abbf7d64a97f5213116027b0b9`；intro-once.test.mjs `82329d2385cc98c966a9d2e942ea3a2608f3e64749773d26f4b4688221946c01`。共五個 dirty 檔（含本狀態檔），沒有 commit/push。exact HEAD 仍為上列 b901e347／cfe365d5；Reviewer 必須看這些 dirty bytes，不能只審 HEAD 舊檔。

**Pending／下一個安全動作。** 父透過本次完成事件直接交原 Reviewer 審上述五檔 patch、測試與限制；Primary 待原 thread 裁決後只修必要缺陷。原 R6 run/artifact/hash/期限/預占完整保留，輸出仍品質 BLOCKED，不採用、不發布。Actions SOURCE_SHA/PAYLOAD_HASH 仍固定舊已消耗版本；新提示是離線候選，刻意未綁入任何可執行新批准，不會使 R6 重跑。新 log 出口無法追回歷史 R6 的內容，不偽造已有遠端交付。

**必要 gate／剩餘限制。** 當前離線修正和獨立 review 無需 Owner 操作、新費用或權限。若要驗真模型繁中品質及正式 log 交付，只集中一次提出新有界生成包：reviewed source/code 版本、新提示 hash、一次呼叫、預算與截止、已核可的執行入口；原已過期限批准不可復用，不自行開 R7。job-log 出口不需額外 GitHub 權限；若正式工具傳輸再受阻，仍不得繞過。既有 UI 人工選檔及 exact source report 的限制沒有被此次 task-level 交付接線解除，不宣稱商家 UI 自動交付；Owner 啟動／批准 gate 及整包無人值守尚未消除。59+35 項離線 PASS 不是新真模型品質、正式遠端 log 或整體無人值守 PASS。

**2026-10-09 INTRO-TRIAL 固定 R2 proxy／累計預占修復（04:25:05 UTC批准）。** 基準e7808b0，原branch／PR28。真Node子程序＋loopback fake proxy證明opt-in、marker經代理、拒絕不退直連與guard拒絕；正式R2只用單程序 `--use-env-proxy` 接既有平台proxy，不改代理／TLS／CA／網路設定。原executor `01a11e97-7708-75cc-be21-0e58b54c30a9` 舊UNKNOWN與US$1永久保留；新固定R2須驗原journal bytes hash／task／reservation，另預占US$1、累計capUS$2；5%稅已由Owner確認，原deadline不延。58本機tests PASS，原UI/frozen/source/DB不變；Primary未prepare/live、key或真API请求。[固定activation、一次命令、ledger及代理限制](prototype/intro-trial/README.md)。待exact CI／Preview與原Reviewer，父才將綁定HEAD的activation交同一原executor；不新建task、不自行activate。CoreMilestoneProgress=0，限必要Blocking修復；舊失敗根因與真network-secret相容仍UNKNOWN。

**2026-10-09 INTRO-TRIAL-01-R1 offline診斷修復（03:37:35UTC批准）。** 起點c272bdd，原Primary／branch／PR28；唯一API executor `01a11e97-7708-75cc-be21-0e58b54c30a9` 已UNKNOWN，calls1僅reservation，完整US$1仍held，不重送不歸零。舊錯誤／HTTP／usage遺失不可重建，不歸咎proxy或key。本包只補allowlisted phase/type/code/status/provider ID、timestamp/correlation與安全runtime能力、離線redaction／storage測試；無proxy/config啟用、key操作、模型請求或executor journal修改。[新診斷及歷史界線](prototype/intro-trial/README.md)。既有UI/frozen/Review/DB不變；待exact CI／Preview與原Reviewer，不自行activate。

**2026-10-08 INTRO-TRIAL-01-R1（17:47:39UTC批准）。** 起點913214d，原branch／PR28；R1取代三count三generate，僅既有public intro的一次generation，固定snapshot／global standard，payload≤4096 UTF-8 bytes（不是tokens），output1500，發送前預占整US$1與唯一slot，UNKNOWN永停，原deadline不延。原task讀回正式state不存在、key名稱不存在；此處只做offline，live NOT_RUN。R1回條明確新版，不動UI功能／frozen／Review／DB。父另安排唯一API測試task及network-secret；不冒熱繼承，不新建task或搬key。[命令、非秘密activation、固定journal與交接限制](prototype/intro-trial/README.md)。

**2026-10-08 INTRO-TRIAL-01（16:16:40UTC批准）。** 起點 `3609252bc1425459f47e294214d5ec761edd672b`，原branch／PR28。新增受控單批runner、固定三source候選JSON及靜態子頁預覽載入→引用／原文差異／理由→套用編輯複製；凍結商品與Review核心、DB/Save/Publish不變。live **NOT_RUN**：count計費與稅上限未知，有效runtime binding未確認；Owner截圖餘額US$5、auto-reload OFF不再列未知，不沿用過期keys。本包不讀secret、不建正式journal、不重抓目標。離線驗證與安全邊界見[本包說明](prototype/intro-trial/README.md)；exact CI／Preview與既有Reviewer另附，Primary不自行驗收。CoreMilestoneProgress=1僅候選載入審閱能力，不代表模型改善或live成功。

**2026-10-08 子頁來源適配（14:00 UTC批准後續包）。** 起點 `7d5111156b96d6c8fa02311bada279926b50bdc3`，原branch／PR28。依既有只讀task最小真頁DOM分析，在service候選入口新增精確URL WebPage／canonical／metadata＋唯一header介紹綁定，輸出static_subpage、分離頁名／H1／intro／meta，三欄保留原文未改善；隔離全站產品／form／補充段落，歧義拒絕。47 Python＋26 frozen/Review契約＋1280/390 synthetic UI本機PASS；frozen bytes/hash/assert、Save/Publish未變。Primary未GET目標或取得完整raw；固定候選交父做保留真頁離線重驗與原Reviewer，exact CI／Preview尚待本包交審回條。[本包證據與限制](docs/Service_Source_Preview_2026-10-08.md)。CoreMilestoneProgress=1僅本機窄子頁來源草稿能力，真頁與商業改善不冒PASS，不新增功能包。

**2026-10-08 服務／工具來源預覽（本機候選）。** Owner批准、父限定先完成可獨立驗證的單一schema.org Service／SoftwareApplication＋相符可見scope名稱／描述契約；正確頁型、來源對照、草稿預覽／複製、未改善標記。44 Python＋20 Node＋6 frozen契約＋1280／390（含既有商品每尺寸22下載）本機PASS，Save/Publish與商品payload契約不放寬。af4已push、Preview成功，但CI frozen檔案檢查FAIL；必要修正將原HTML／JS／parser恢復exact bytes，能力移至service-result獨立候選入口與薄API adapter，本機重驗通過，待修正HEAD的完整CI／Preview與原Reviewer重核。父已確認原免費CI／Preview批准；指定健檢站來源存取受阻，未再嘗試、真站適配未驗。[範圍／證據／checkpoint](docs/Service_Source_Preview_2026-10-08.md)。CoreMilestoneProgress=1僅指新增窄頁型的本機能力；不代表內容品質、真站驗收或搜尋成效。舊窗口不沿用，全面英文修正仍延後。

**2026-10-07 AR2-CLOUD-01：工程可靠性／自主執行驗證，CoreMilestoneProgress=0。** 最新派工在 `feat/private-host-bootstrap`，起點 `263e6f4d63cd18164284d6e56f67c93f2098cd5c`；窗口12:04–16:04 UTC，不是8小時試跑。source tar改同目錄完整暫存、fsync、原子不覆蓋發布，新增SIGKILL與並行builder synthetic驗證；舊HEAD的tar／manifest hash保持相同。17個bootstrap測試PASS。contract已接受；PR授權仍 `BLOCKED / AUTHORIZATION_PROPAGATION_FAILURE`，不重試、不繞route，Stage2不能報整體PASS。commit／push／exact CI／Preview及既有Reviewer、父controlled continuation按 [單一action／證據紀錄](docs/Autonomy_Readiness_Stage2_2026-10-07.md) 接續。無新產品能力、主機操作、登入或live URL／模型呼叫。


**2026-10-06 私有主機 closed bootstrap 離線交付。** 以已審PR27 `eec7a640c26878a33139179522d495463b7c382c` 為base，`feat/private-host-bootstrap`。固定Node24官方SHA／git-object source bundle、NVMe by-id/serial/signature與Owner精確receipt gate、UUID mount每次啟動檢查、nologin帳號與closed systemd初始化、JSON結果/退出；[執行及一次批准範圍](prototype/private-site/bootstrap/README.md)。12個synthetic gates＋13個既有gateway/host契約PASS，無真disk/OS/hosted mutation。實機套件版本、disk mapping與格式化批准未取得；SMTP/Auth/TLS/DB/WP秘密、image/Compose初始化與完整privateapp均留下一階段。無UI變更／無boundedRC重跑；待exact CI/Preview/source artifact與既有Reviewer，不自行APPROVE。CoreMilestoneProgress=1（Mac執行closed bootstrap的可審artifact），maintenance=0。


**2026-10-06 最新 Core：共同 stopped-writer cut／全新隔離 target 恢復（未部署）。** 父核已審 PR26 `f08c30d748bf73bbf9ab96496f428fa23bc12abb`，獨立 `feat/private-site-recovery` stacked base `feat/private-site-theme`。WP 真 tmpfs files／MariaDB一致性邏輯資料／scanner SQLite backup API／既有 readonly journal，加本機native14表與新credentials UUID連結，一個checkpoint後原服務全退出才啟動新target。1280/390 fresh native session exact version/review/audit/history、3頁raw/meta/controls/filemetadata、SQL/defaultACL/autoRLS、secret/grant不復活、unknown GET-only／mixed/hash/incomplete/nonempty/crashlock拒絕PASS；[逐點證據](docs/Private_Site_Recovery_驗證_2026-10-06.md)。候選限已知三頁/allowlist，非任意WP/hostedAuth全站備份。CI/Preview exact receipt 見本輪PR，交既有Reviewer `01a10f3b-3546-72bb-b3d1-4a37140556ea`，非Primary自行APPROVE。CoreMilestoneProgress=1、maintenance=0；無hosted/SSH/DNS/磁碟/費用/持久grant/Owner登入/RC操作，frozen/舊worktree未動，不另建治理修復。沒有獨立必要Core自動續開，待Owner整體部署批准；retention/credentials/destructive restore/preflight另批。

以下 PR26 為已接受前一輪。

**2026-10-06 最新 Core：三頁正式WP theme／內容垂直候選（未部署）。** 父核Reviewer `01a10f18-4cc4-766d-8ba4-0bde0f4f73cd` APPROVE_WITH_DEFERRED_DEBT PR25 `b7d2e93e01793d3cb33a6709fbcdacd1892d0006`，獨立 `feat/private-site-theme` stacked base `feat/private-site-schema`。只有明確產品頁輸出單一Product name/description；About/Privacy為控制頁，Privacy已知公司/聯絡/資源區域與待核SMTP/analytics/保留刪除分列，public_ready=false。新schema/nativeAuth→真WPscanner→Save/freshlogin/Review→gateway/publisher兩POST publish/restore、unknown GET-only、控制頁SQL/HTML不變、1280/390鍵盤及journal readonly recovery PASS，[逐點證據](docs/Private_Site_Theme_驗證_2026-10-06.md)。完整WPfiles/MariaDB/scannerSQLite共同備份還原依父允許先拆下一slice，交[候選manifest](prototype/private-site/theme/recovery-manifest.json)，NOT_IMPLEMENTED_NOT_RUN，不能以journal恢復替代。未hosted連線/部署/本人登入/新增grant/費用，P3 limiter/CIaction不擴修，frozenRC與worktree不動。待exactCI/Preview與既有Reviewer；CoreMilestoneProgress=1、maintenance=0。

以下PR25為已接受前一輪。

**2026-10-06 最新 Core：新專案非RC schema／RLS／Save–Review候選（未部署）。** 父核PR24 `3cc7d84776de88f7e5f480426369353735ac9ae1` APPROVE_WITH_DEFERRED_DEBT；獨立 `feat/private-site-schema` stacked base `feat/private-site-wiring`。14表／14原SELECT policies／24函式與exact ACL manifest、future-default不變、closed writer＋四支EXECUTE activation/disable、無identityseed，準備[未來一次批准包](prototype/private-site/schema/README.md)。隔離native PostgreSQL/GoTrue/PostgREST與1280/390 Save→真logout→fresh native login→exact readback/Review、unknown GET-only、tenant/ACL拒絕PASS，[逐點證據](docs/Private_Site_Schema_驗證_2026-10-06.md)。本輪重入誤採thread最初PR19初始化，未改branch或既有內容，最小SYSTEMIC_FIX將最新派工優先核對提升AGENTS入口；未動CLI/loader。未連hosted／舊DB27／key／Ownerlogin，無DataAPI／持久grant／部署／費用變更。待exact CI/Preview與既有Reviewer，非自行APPROVE；CoreMilestoneProgress=1、maintenance=0。三頁正式theme另slice、P3 debt沿用不擴修。

以下PR24為已接受前一輪。

**2026-10-06 最新 Core：單站私有部署候選接線（未部署）。** 父核 PR23 `566255f37aadb51ef72ae0f810659f610d9bf23b` 已審 APPROVE_WITH_DEFERRED_DEBT，CI37289957080／Preview62u7v8ysnw6qUxjYWKK9GPNSjMmR success。由此建立 `feat/private-site-wiring`，stacked Draft PR base `feat/single-site-node-host`。沿用 UI／Python product_api／Node publication host／WP/MariaDB，以精確Host/Origin固定代理、新Supabase runtime/CSP allowlist、closed activation與service啟停模板補接線。13契約及1280/390完整synthetic流程、真TLS CLI重啟、unknown GET-only／2WP POST／fresh-token歷史與tenant拒絕均列於[逐點證據](docs/Private_Site_Wiring_驗證_2026-10-06.md)；exact CI/Preview見PR交審。Systemd目標主機啟動未跑，非RC schema與三頁正式模板另slice；[精確部署批准包](prototype/private-site/README.md)尚未執行。CoreMilestoneProgress=1，maintenance=0。未部署AWS/Supabase、無持久grant／公開網路／DataAPI／磁碟／費用或舊DB27變更，待既有Reviewer，不自行驗收。

以下 PR23 Core 為已接受前一輪。

**2026-10-05 最新 Core：單站 Node host startup／真HTTP／私有store生命周期。** 基準PR22 `dc2ec8b6641df1fd0639bf671e7099bfececd479` 已由父核Reviewer `01a10b50` APPROVE_WITH_DEFERRED_DEBT、CI37286033704 71步及Preview F19hRfy7Z4oKJxFKwsFgV8ZJDJ5y成功。branch `feat/single-site-node-host`，獨立stacked DraftPR base `feat/gsc-native-date-contract`。新增closed-by-default Node入口，沿用單站service／Auth／Review／GSC history，實際HTTP child process、SIGTERM drain／crashlock failclosed；29相關契約與最後11 host/storage契約、1280／390完整流程及driver+service退出後fresh-token exact history/measurement讀回通過。[部署需求／逐點證據](docs/Single_Site_Node_Host_驗證_2026-10-05.md)。待exactCI/Preview与既有Reviewer，非自行APPROVE。CoreMilestoneProgress=1，maintenance=0；host／TLSproxy／secret／長期volume／backup／費用另批，未部署、無新增持久grant。

以下 GSC 日期 Core 為已接受前一輪。

**2026-10-05 最新 Core：GSC 原生日期／來源契約（隔離驗證）。** 父指定 PR21 已 APPROVE 的 `0bd9d3e63041ec7555c29307cff222e7ff09e4a7` 為基準，branch `feat/gsc-native-date-contract`，獨立 stacked Draft PR base `feat/single-site-pilot-candidate`。本輪沿用單站發布 receipt／持久 journal 與 CSV，加入 America/Los_Angeles 原生日、DST 23／25 小時、完整日與恢復／新版本截斷、明確來源／property／頁面／篩選口徑；缺日／無資料仍 unknown，synthetic／provider_asserted 不升格 verified。63 契約與 1280／390 Save→fresh session exact readback、權限零差異通過；[逐點證據與限制](docs/GSC_Native_Date_驗證_2026-10-05.md)。待 exact HEAD CI／Preview 與既有 Reviewer 裁決，不自行宣告 APPROVE。CoreMilestoneProgress=1，maintenance=0；無 GSC/OAuth/live data、hosted mutation、新費用或持久 grant。

下列「完整內部 RC 候選」為歷史快照，不作本輪派工／branch authority。


**目前 Core：完整內部 RC 候選。** 基準 `753dd9c47655e961221a1ef6be9bf8a9aef7194c` 已由 Reviewer `01a10857-2c6c` APPROVE（CI `37226680267` 59步／Preview `H6gCsEbPeZw3TMUoJ7xnbfUETxpX` success）。父指定補實際頁面scanner來源、可信HTTP/Auth/SQL/發布接線、整個runner結束後重新登入讀回的持續候選。短命既有入口已改讀owned WordPress真HTML，不再預製URLresponse，1280/390走HTTP service完成原完整路徑；產品scanner無localhost/SSRF例外。

standalone runtime、native GoTrue/PostgREST/PG與WP持續部署候選、原schema組成、兩phase整體腳本已準備；**真persistent環境／原生Auth／全部runner結束後驗收 NOT RUN**，因新持久secret/grant/deploy需父就[完整envelope與逐點證據](docs/Internal_RC_Candidate_2026-10-04.md)一次請准。現有hostedDB27、disabled8b25、frozen、不restore／Owner站／新費用界線保留。這不是完整RC/MVP/liveM3完成。CoreMilestoneProgress=1，maintenance=0；新候選CI/Preview交既有Reviewer，不自行啟動pending環境或④。

### 已接受同run process恢復（歷史）

**已接受 Core：同 run 發布服務 process 重啟恢復。** 基準 `f5050c9ddb0d7adea5058244df95e3c611bcef1c`，③既有 Reviewer `01a10836-e798` APPROVE_WITH_DEFERRED_DEBT、CI `37224426420`／Preview `7fE9bVde8rBeXkrsf4ufjU9KywVs` success。父只提升單一 publication service process 恢復為必要 Core；完整 intent／measurement durable journal 在 POST 前 fsync，實際 SIGKILL／新PID後以 fresh synthetic session與原有效短grant讀回 exact publication／measurement，pending恢復unknown只GET、不重送。缺檔／損毀／partial commit、錯tenant/version/page、drift、到期／撤銷failclosed；不重發或延長grant，secret不落盤。詳見[逐點驗證、commit邊界與有界RCA](docs/Publication_Process_Restart_驗收_2026-10-04.md)。

本機31契約及1280／390完整①②③入口驗證；每尺寸3次實際SIGKILL恢復，維持4WP寫入（2發布＋2恢復）、量測有journal寫入但零額外WP／SQL mutations。Auth／TLS broker仍存活，這不是整個runner／主機／跨run恢復。多writer/CAS、跨run授權、真provider仍P3，未擴修；原Auth／disabled8b25／frozen／hostedDB27界線保持。exact新HEAD CI／Preview交審另核，Primary不自行最終驗收。CoreMilestoneProgress=1，maintenance連續數=0；下一工作由Dot選，不開始④Owner站。

### ③已接受切片（歷史；單process恢復由上節接續）

**已接受 Core：③ exact version 的發布／量測視圖。** 基準 `3c8f7c4c70ae252e0431ab76c2908181a34a2582`，②既有 Reviewer `01a10817-6f24` APPROVE_WITH_DEFERRED_DEBT、CI `37222164405`／Preview `6TKHHKWmAMbw7DWQ48KkKHqrLxF6` success。復用既有受控 WordPress journal、measurement preparation、page CSV 與 report 算術，顯確切版本／頁面、首次發布／此次修改／讀回／restored 狀態。前後 synthetic／provider-asserted CSV 依來源名稱、UTC 完整日、搜尋類型、篩選、覆蓋與本次修改→恢復區間核對；unknown／zero 分開，無真流量或因果宣稱。觀測只追加同 run journal，fresh session 讀回；新版存在後歷史 v1 仍保留證據，v2 不借用，restore 後失效 followup 排除。詳見[③逐點驗證與 debt](docs/Version_Measurement_驗收_2026-10-04.md)。

本機 24 契約及 1280／390 完整①→②→③入口通過，錯頁／錯期間／缺日、tenant/source/version、logout late response 拒絕；量測零新增 WP／SQL mutations。新 HEAD CI／Preview／既有 Reviewer 另核，Primary 不自行最終驗收。多 writer 原子競態、跨 run/server restart 持久化仍為允許延後 P3，未擴修。原 Auth／DB27／disabled8b25／frozen／本機資源清理界線保持；無④Owner 真站、外部 provider／grant／費用或 hosted 操作。CoreMilestoneProgress=1（③可用關聯與歷史／恢復視圖），maintenance 連續數=0；下一工作由 Dot 選定。

### ②已接受切片（歷史；③已由上節授權）

**已接受 Core：②受控 WordPress 單平台發布。** 父確認① `0fcbc50c103fa377b58f0371faa8cf72b8a05226` 經既有 Reviewer `01a107ea-a4e4` APPROVE；治理 `f9f5f47df517208cd216cb8ea95d7a81044f550a` 經 Reviewer `01a107f4-d9f2` APPROVE、CI `37220142034`／Preview `JDjznRrYHv2cPYxh9hxQcTDtnZZv` success。Dot 已指派②，執行端準備 pinned 官方 WP／MariaDB 的 disposable local site、合成目標／對照頁及短期受限 App Password。復用①入口完成 exact Review→現況差異→獨立發布確認→真 HTTPS WordPress API／HTML→journal→fresh session UI 讀回→核基線恢復，1280／390 完整驗證；詳見[②證據與逐點驗證迴圈](docs/Controlled_WordPress_發布驗收_2026-10-04.md)。固定 `3c8f7c4c70ae252e0431ab76c2908181a34a2582` 已由 Reviewer `01a10817-6f24` APPROVE_WITH_DEFERRED_DEBT；父核 CI `37222164405`／Preview `6TKHHKWmAMbw7DWQ48KkKHqrLxF6` success。

②仍是隔離站證據：runtime 新發布預設關閉、原 Save／Review disabled／frozen／hosted DB27／原 Auth 不變；不代表持續平台 grant、完整 live M3、真站品質或流量。短期 grant 已驗到期／撤銷，該 run 容器／tmpfs／env／TLS key 清除，只留無 secret synthetic 證據。無 Owner 既有網站、外部帳號／OAuth、公開／付費站或模型。CoreMilestoneProgress=1（②真受控平台最小閉環），maintenance 連續數=0；③已由 Dot 指派，見上節。治理規則沿用 AGENTS＋正式 skills，不另立框架。

### ①已接受切片（歷史；②已由上節授權）

**已接受 Core：① URL→成果→編輯→保存→fresh session→確切版本確認，單一隔離入口。** 基準 `7e4d089521d91f380426de847bd62b743fe0acd1`，父確認 Reviewer `01a107d5` APPROVE、CI `37217709208`／Preview `BgXQjmUKFMhBE23nVp3QsDTggjwV` success。本增量只改既有 `auth-session-regression.e2e.mjs`，接上已存在的 URL fixture、first-result UI、三欄編輯及正常 popup handoff，不由预製 JSON 匯入跳過 URL 段。1280／390 實際保存後 logout／關閉全部舊分頁／全新 context與token，精確取回後才首次確認同版，再讀回同 review；source／Unicode編輯 bytes、request／version／audit增量一路核對。原4安全負測、PG17六案、新版失效／viewer／foreign四403與零額外增量全通過。詳見[同一入口增量與②提案](docs/Unattended_Auth_Session_Regression_2026-10-04.md)。產品／Auth fixture／SQL／CI入口／runtime disabled／frozen不變；真Auth、live URL與完整線上M3不冒稱通過。

CoreMilestoneProgress=1（①端到端隔離整合驗收缺口補齊），maintenance 連續數=0。下一②先提案 self-hosted WordPress disposable測試站：一個固定合成page、受限可撤銷測試授權、三欄preview→publish→API＋HTML讀回→失敗／unknown核對恢復，對照頁不變；meta需明確註冊及渲染，不用excerpt冒充。方案／權限／費用界線見上方證據；尚未建站、下載映像或授權平台寫入，外部商家與Owner既有站不是本步前提。不擴CSV／治理maintenance。

**2026-10-04 16:32 UTC Owner 核定：方向與驗證順序對齊（documents-only）。** 北極星維持「網址→第一份可用成果→確認→發布→量測」；價值是有依據的網站改善落地與相關流量觀測，三段 AI 文案只是可能交付物。唯一[藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)已把使用者流程與內部驗證順序分圖：①URL 到編輯／保存／新 session 取回／確切版確認核心可靠→②執行端受控站一種平台授權／preview／publish／readback／失敗恢復→③版本／頁／發布時間／改善前基線／後續观測關聯→④內部完整驗收後，Owner 自有真內容且開放搜尋站成效試點→⑤依結果修正後外部商家。外部商家不是工程前提，自有站／平台／改動範圍於④確認，本次不授權改既有網站。

功能可用、發布正確、數據可信、成效觀測、使用負擔五類驗收分列，test PASS ≠ 流量價值。現有帳號／權限／tenant／來源／版本／review／audit 保留；日常 synthetic regression 不依賴 Owner email／2FA，真人 checkpoint 僅限必要相依步驟。OpenAI Ads／無關擴充／P3 debt 延後。

| 能力 | 已實作 | 隔離測試通過 | 線上驗收通過 | 目前開放狀態 |
|---|---|---|---|---|
| URL→帶來源成果→本頁編輯 | URL API、三欄預覽、來源／版本與本頁 Review | scanner/API、1280／390 成果／編輯／匯出；[證據](docs/URL_First_Result_驗收_2026-10-02.md) | 歷史一個公開商品結果成功；不等於任意網站品質或流量價值 | URL 預覽已有入口；本輪不作 live URL 呼叫，暫存100cap仍有限制 |
| 保存→新 session 精確取回 | exact-org/version 保存與恢復、原版本保留 | 單一 synthetic Auth＋隔離 SQL 入口與原 v1/v2 UI 流程 | [bounded v1](docs/Bounded_M3_Fixed_Case_驗收_2026-10-03.md)／[v2 續編](docs/Bounded_V2_續編驗收_2026-10-04.md)子閉環已驗 | Save 現為 closed；歷史批准不延用 |
| 確切版本確認 | URL 專用 Review、版本／source 綁定、audit、新版失效 | [無人值守 Save→Review→fresh readback](docs/Unattended_Auth_Session_Regression_2026-10-04.md)通過；現已接上 URL fixture／正常交接，見本頁最上方增量 | persistent Review hosted 五項操作未完成，0 Review POST，不稱完整 M3 live PASS | Review 現為 closed；工具限制保留，無 restore 批准 |
| 發布／交付 | 三欄 Copy／JSON 與唯讀差異／缺口預覽 | exact version、歷史／viewer、clipboard／download bytes 等通過 | 未完成任何實際平台發布閉環 | 無發布 writer／平台授權；匯出標未發布 |
| 量測準備／頁面資料適用性 | 未關聯網站背景、暫存頁面 daily CSV 檢查 | 58相關契約、1280／390 valid/invalid、zero/missing、identity/late／零額外寫入通過；[證據](docs/Page_Observation_離線驗收_2026-10-04.md) | 尚無關聯真發布的數據／成效驗收 | 唯讀／記憶體檢查；synthetic／提供者聲明，發布與本版成效 unknown |

16:32 文件對齊時排定的①URL端到端整合，現由上方增量補齊隔離驗收。後續按②受控站单平台發布方案推進，不重建已驗的保存／Review或擴CSV。

文件更新基準為已推 `4e234e6fd4e8d00a4d0ef865aba90c158fcf0533`，checkout／origin 即時 ref／PR #19 已一致、開始時目錄乾淨。前候選 `e8874c0` CI `37216716821` 失敗根因是 typed-draft 將新本機唯讀 CSV form 誤計為寫入表單；已重現並精確限定該表單例外，原禁止寫入及 mutation 斷言保留，1280／390原測試通過。修正 HEAD 的 [CI `37217076777`](https://github.com/RC918/Growth-OS/actions/runs/37217076777) success（job `111479652937`，57步全成功、實際 logs 已核新增7契約及1280／390 CSV與原typed流程），[Preview `CenJjKXGeAkpyLkKXP9VUb96xoeA`](https://vercel.com/morning-ai/growth-os-preview/CenJjKXGeAkpyLkKXP9VUb96xoeA) success；這是隔離／build證據，不是 live 互動或成效放行。此方向修訂只改文件；原 runtime／SQL／frozen／Auth／remote closed 狀態不動。新費用／帳密／外部授權／既有網站修改由父提出具體需求。

一致性檢查：七份 Markdown 差異，84個本機連結／anchor 存在；唯一藍圖兩張分開流程圖、五段順序／五類驗收／四層狀態與權限界線已核，歷史 Mermaid 不作現行流程；修改標題無舊入鏈，`git diff --check` 通過。runtime disabled config／frozen index hashes 未變。

16:32 文件對齊當時不另計 Core 功能，maintenance 連續數=1；現已回① Core並歸零，無新 task／writer。

**2026-10-04 15:07／15:11 UTC Owner 更新：** 真人必要事項確認屬 `HUMAN_REQUIRED` checkpoint，只阻擋直接相依的真人確認／實際發布，不代表專案停止；日常 regression 沿用安全隔離 synthetic fixtures／test-only sessions，不依賴 Owner。Reviewer `01a10779` 已裁定本輪 Bolt A synthetic fixture 屬 A：可自動化日常測試，並非 HUMAN_REQUIRED；既有單一入口已覆蓋五 checks／精確讀回／新版失效，不重建 harness。hosted 工具拒絕另列執行限制，不重試／restore。下方 14:34「停止／解除限制後再恢復」僅記錄當輪 remote 操作收尾，不限制已重新批准的獨立 repo/offline 工程。正式治理已併 AGENTS 與 mission／engineering skills。


## 先前切片 checkpoint（歷史；下一步由上方 16:32 順序取代）

**已推送 Core：選定成果旁檢查頁面級資料適用性（repo/offline）。** 基準 `f15c1e3d23ddf598478b504226963de796daf024`，父確認 Reviewer `01a107af` APPROVE、CI `37215248021`／Preview `8KHNidTetA23nuNkWtGsYNmQ5foa` success。在 exact version 旁暫存頁面篩選每日 CSV，填完整頁面／搜尋類型／期間／匯出時間／來源／篩選說明，重用既有 CSV 計算，顯示適用性、覆蓋／缺日／明確零。網站彙總及其他頁面不可作頁基線；URL 吻合僅聲明相容，synthetic／providerasserted 不升格已核實，發布時間及本版成效仍未知。輸入／續編／版本／session／關閉令暫存或晚回應失效。58 項相關契約及 1280／390 valid/invalid CSV、其他頁／site、fresh/history/viewer、零額外寫入通過，詳見[頁面資料證據](docs/Page_Observation_離線驗收_2026-10-04.md)。CoreMilestoneProgress=1、maintenance 連續數=0；disabled／frozen／SQL／Auth 不變，無新 schema/store/adapter/OAuth 或 remote 操作。

下一獨立缺口：兩份同頁／同口徑資料的相容性與期間觀測比較；不可宣稱發布後效果或因果。實際發布與 live 數據來源仍待各自批准，100cap／P3 debt 不擴張；本輪交付後停止。

**前一已接受 Core：確切成果版本旁的量測準備／資料缺口（repo/offline）。** 基準 `fca586344d27f21f9a58de7fceaee7262c0b93bd`，父確認 Reviewer `01a1079c` APPROVE、CI `37213885365`／Preview `BTJAAtNWeiLTS14jApryTibExp12` success。新增同版本旁唯讀檢視，重用交付出口的身份／版本／payload 驗證與原 baseline snapshot/report；顯示候選頁、未核實發布、頁面基線／後續／效果未知。既有觀測只能手動選作「網站層背景資料，尚未關聯此頁／版本」；同域／路徑聲明不配對、不歸因，明確零／缺日原樣保留。1280／390 驗未確認／新 session／歷史／viewer、無資料及三種背景，檢視前後觀測／audit／versions 不變。詳見[量測準備證據](docs/Measurement_Preparation_離線驗收_2026-10-04.md)。CoreMilestoneProgress=1（使用者能在確切成果旁看懂量測缺口），maintenance 連續數=0；無新增 schema/store/CSV/adapter/OAuth，disabled／frozen／SQL／Auth 不變。

下一獨立缺口：頁面級觀測與確切版本／核實發布證據的可檢查關聯契約，可先離線驗證必要欄位及不相容拒絕；目前網站 snapshot 無法提供此關聯，不能自動升格。真發布／live 數據授權仍是相應實際操作依賴，不要求真人 checkbox 才繼續獨立工程；100cap 與 P3 debt 不擴張。

**前一已接受 Core：恢復已保存版本後複製／下載三欄成果（repo/offline）。** 基準 `64962927e0b61494c48c6bfbff953cdfe6616888`，父確認 Reviewer `01a10789` APPROVE、CI `37212568096`／Preview `6c8QfFk33bBQSFuLVoKeabmZ4iAC` success。既有版本檢視旁新增 Copy／JSON，輸出前重讀同 org／version／完整 payload／source，最新或歷史分類不符拒絕；歷史明示歷史，續編期間停用，晚回應／session 替換不能觸發輸出。複製三欄加版本來源識別；JSON 包含完整 payload 與摘要，不證明 Review／站點所有權或發布。1280／390 真 clipboard／每 viewport 4 份 download bytes 已比對，預览與交付皆零額外 POST。詳見[交付出口證據](docs/Saved_Result_Delivery_離線驗收_2026-10-04.md)。CoreMilestoneProgress=1（新 session 恢復成果後可直接交付），maintenance 連續數=0；actual disabled／SQL／frozen／Auth 不變。

下一缺口仍是實際發布的單一試點平台、站點最小授權、當前目標內容與確切發布／讀回；交付檔案不當作發布成功。無新 remote 操作或人工 checkpoint 需求，100cap 與既有 P3 debt defer。

**前一已接受 Core：發布前版本／候選目標頁／差異檢視（repo/offline）。** 基準 `2ef454682f85015510481a890612f9b45aea9273`，父確認 Reviewer `01a1075a` APPROVE、CI `37209962173` success。既有 typed-draft／exact Review 保留；新增已保存版本旁唯讀檢視，未確認也可查看三欄保存快照原文→待套用內容、候選目標 URL，以及版本 Review／平台／站點授權／發布確認各自缺口。候選 URL 不代表所有權，快照不是平台現況；歷史／來源漂移／session 替換拒絕，續編清除預覽。沒有發布 writer／adapter／OAuth／假發布紀錄，actual Save／Review disabled 與 frozen 不變。詳見[離線切片證據](docs/Publish_Preflight_離線驗收_2026-10-04.md)。

CoreMilestoneProgress=1（使用者可从已保存成果查看發布前差異與阻擋原因）；maintenance 連續數=0，治理更新併本 Core。下一依賴為真實發布的單一試點平台、站點最小授權、即時目標內容與確切發布確認；這些只限制相應 live 操作，不阻止獨立已授權工程。完整 live M3／M4、Publish／Measure 未完成；100cap 與 P3 文案仍 defer。

## 14:34 安全收尾快照（歷史；15:07／15:11 普通工程授權已恢復）

**2026-10-04 14:34 UTC 安全收尾：** Reviewer `01a10755` APPROVE safe-closure，父已通知 Owner。persistent Review 已完成批准的 authority revoke／closed install／enable，首次真 UI 五項勾選遭工具安全拒絕，全部維持 false，1 次人工登入、0 Review POST、0 review／audit 新增；隨後已完成批准的 closed config＋tracked disable。Save／Review 全 closed，DB history 27，無待 cleanup。兩表四寫權的必要安全修正保留；完整 M3／live Review **未完成**。

已驗 runtime HEAD `e1a008c48734c04f6592d19673747a012b7f3c36`，[CI 37208971001](https://github.com/RC918/Growth-OS/actions/runs/37208971001) success（57 steps、無跳過），[Preview wGZQCtPZiLE6bCYAmDoW21HbS6Fe](https://vercel.com/morning-ai/growth-os-preview/wGZQCtPZiLE6bCYAmDoW21HbS6Fe) success。兩份 config 為 frozen persistent disabled SHA `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`。20 表原資料投影、原 23 history 全 rows、allowlist 外 catalog 與 PG role memberships 均保留；完整 migration/hash／來源／批准時序見[安全收尾紀錄](docs/Persistent_Review_安全收尾_2026-10-04.md)。

該次 live Review 的 blocker 是工具對 Review 勾選的受限執行。Reviewer `01a10748` 確認 synthetic 本版主張與來源吻合，但未解除 execution 拒絕；不是新產品 P2，不能改 unknown 造事實、換 route 重試或 reopen。後續須先合規解除受限執行，再取得新的 restore／操作批准並重核部署、schema、ACL；本輪不再建立準備包或診斷，不要求日常 Owner 2FA。日常 synthetic regression 繼續沿用既有入口。

CoreMilestoneProgress：本輪 hosted 安裝與兩表權限修正已落地並完成安全關閉，沒有新增 live Review 成功閉環；既有 Save／跨登入讀回及 offline Review 證據保留。本次 docs-only 是同一 Core 的必要閉環歸檔，不另計產品能力、不另開 maintenance；完成後停止，交既有 Reviewer。100cap、Publish／Measure 與既有 P3 debt 不擴張。

## 2026-10-04 早期候選與離線階段（歷史，已由上節取代）

以下「未批准／未安裝／待啟用」、旧 config hash 與 next step 僅保留當時狀態，不是目前授權或後續指令。

**同一P2修包追加Reviewer `01a10626`明確範圍：** 父核`organization_members`同audit raw ACL、唯一authenticated SELECT members_read_workspace且無writepolicy；signup未見自動membership不消除TRUNCATE風險。現以共同guard與單次tracked `authority-revoke.sql`精確處理audit_events＋organization_members兩表，PUBLIC/anon/authenticated四寫權撤除、SELECT/RLS／管理者維護/private查詢／service_role保留，不新增writer、不改signup、不掃描更多表。合併pre/post、preservation allowlist與envelope，仍3 tracked操作而非逐表加窗。audit-only中間HEAD `4d0fafcce0c5701ae1a20a21712afffa91022ceb`與SQL原bytes保留為superseded歷史，只有合併最終HEAD交審。父報告其餘Auth證據無額外blocker；所有hosted撤權仍未批准／未執行。

**本修包最初audit P2證據（現已合併如上）：** 基準`c4ae4ec34df52a1271a059db0301adc905b54a1f`／CI `37187566457` success。父08:48有效ACL、08:51 raw ACL確認audit_events對anon/authenticated直接授予INSERT/UPDATE/DELETE/TRUNCATE（含postgres/service_role的完整原ACL見[候選](supabase/drafts/url_review/persistent/README.md)），唯一RLS policy只有Owner SELECT；TRUNCATE不受RLS。Reviewer `01a1061a`判定啟用前必要P2 blocker，沒有利用／資料受損證據，不稱P1事故。

本slice只更新尚未批准persistent候選：新增兩表共同tracked撤權與postflight，移除PUBLIC/anon/authenticated四寫權，保留SELECT/RLS、postgres/private-definer audit、service_role及其他schema/角色；enable/restore及postflight要求四有效寫權false。保存allowlist明列兩表ACL差異，不再說全部ACL不變。初始envelope需3 tracked migrations（combined authority revoke→closed install→enable，history23→24→25→26）及原2 config transitions，全部仍需Owner具體批准。

disposable PG17已重現舊grant的TRUNCATE繞過RLS（只在回滾測試交易），修後兩表×兩角色×四種直接寫拒絕，正常Owner RPC恰1review+1audit，audit失敗全rollback，合法讀取／旧資料／其他catalog保留；PGlite候選6 tests及既有並發／生命週期PASS。屬Blocking Core必要候選驗證，maintenance連續數0；**hosted P2仍未修復，未獲remote批准，不放行持續Review**。runtimeclosed／原proposal／bounded/frozen不變，不擴100cap／Publish／Measure，P3文案繼續defer。交既有Reviewer核新HEAD/hash/CI後，再由父整包請Owner批准。

**最新方向與基準（2026-10-04 07:48 UTC）：** Owner只同意隔離測試站持續版本Review方向，Reviewer `01a105e3` 方案 APPROVE；未批准remote DDL/ACL/config/資料寫入。上一Core `26bc3e60eaac66437f4814dd16c5b05d2bf3e89b` 已完成，同HEAD CI `37184970799` success，Save→Review→fresh session已串入日常無人值守驗收，不重做真人regression。

本slice備妥[持續Review離線部署候選](supabase/drafts/url_review/persistent/README.md)：原proposal的closed安裝、分列enable/disable/restore、paired readonly/enabled configs、manifest/hash、preflight/state/postflight/preservation與unknown原request GET-only對帳。Save全程closed、不新增parent/version，無自動到期；action window與remote批准仍null。authenticated可EXECUTE兩Review entry，SQL限所有符合條件的同org Owner最新URL draft；不是固定Owner/v2/一次request。停用保留資料/schema/marker與合法唯讀，不誇稱REVOKE會取消已在途交易。恢復必須重核deployment/schema/ACL，不重建或覆寫歷史。

父07:53–07:54唯讀核實：PG17.6 ACTIVE_HEALTHY，history23、最後`20261004050737 url_revision_bound_close_v2`，四Save entry有效ACL皆closed，URL Save body SHA吻合，尚無Review RPC。Fixture A有兩位Owner、B兩位viewer，詳manifest；無production共用／hosted隔離、Auth redirect/signup、exact deployment仍pending，不能由DB人群推定。下步僅交Reviewer，再由父把核实證據、exact commit/hash與完整action envelope一次請Owner具體批准，不自行remote安裝。

本機候選5 tests、既有PG17五案＋持續生命週期1案、1280/390各success/closed PASS；新HEAD CI另核。產品runtime兩份closed SHA `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`、原frozen/bounded不變。CoreMilestoneProgress=1（持續Review部署/停用/恢復候選可審且離線成立），maintenance連續數=0；不冒稱live/M3放行。100cap／Publish／Measure與P3 marker文案不擴張。

**前一階段接受基準：`c3f9f37372edb0b1a7fdf157d600c48e06b085c6`。** 父確認 Reviewer `01a105b7` APPROVE、同HEAD CI `37183932027` success、Preview `4jwTTT28CKR7Qjicbja3Pt6qrjbys` success，Owner已通知完成。以下較早基準是歷史，不回退。

本slice補齊同一日常入口的 **Save → exact-version Review → logout／全新context與token → 原版本／確認讀回 → 續編v2後舊確認失效、只留v1歷史**；1280/390 PASS，沿用既有產品UI/API與隔離SQL，不另建入口或要求兩次真人regression登入。viewer／foreign對Save與Review均由authenticated SQL驗拒絕，所有public資料／audit零增量；4負測、原URL native6案及相關API/SQL19 tests PASS。詳見[整合證據及M3放行核對](docs/Unattended_Auth_Session_Regression_2026-10-04.md#m3-review-串入同一入口)。CoreMilestoneProgress=1（已保存成果到版確認及恢復的單一自動驗收成立），maintenance連續數=0。新HEAD雲端結果另核，不以本機PASS宣稱CI／Preview。

M3 repo核心路徑已有證據，不再新增無阻塞edgecase。完整產品M3仍缺部署環境URL Review權威schema/RPC/ACL安裝與啟用驗收；舊bounded候選是離線資產，沒有新remote許可。**下一產品Core是讓已保存URL成果在核准產品環境可完成確切版本Review**，需父／Owner先明確選定「既有單次bounded驗收」或「持續產品啟用」的部署策略與對應remote envelope；後者不能沿用單次候選冒充正式生命週期。這是安裝／授權缺口，不是再做日常登入測試的理由。不在本turn操作，也不自行將每slice升級成重大milestone。

100cap已知依賴：`product_api.py`的local/ephemeral SQLite固定100筆，第101筆仍拒絕，export不釋放；既有成果保留已驗，這次Review整合不依賴第101筆。若下一URL來源Core需連續取得／保存新成果，需先決定快照權威保存位置（暫存cache或tenant持久來源）、保留期／配額、何種已持久／被版本引用的資料可淘汰及誰可操作；本slice不刪資料、增cap、改store或安裝remote。M1/M2真產品品質、M4試點平台／權限、M5資料授權仍屬各自主線放行條件，不由這次PASS替代。

**現行方向（Owner 2026-10-04 06:27 UTC，Reviewer `01a1059a-5089-7374-94f0-c261041cb6ec` APPROVE）：日常 regression 不再需要 Owner 在場。** 正確repo基準 `5616220aa865d6b36073f22ec732246a88f72170`，同HEAD CI `37182179082` success。已新增[單一全自動 synthetic session＋隔離SQL驗收入口](docs/Unattended_Auth_Session_Regression_2026-10-04.md)，只改test harness／CI／證據；產品Auth、runtimeclosed與frozen原bytes不變。Owner Save→Logout→全新context/session→exact Readback→viewer/foreign RLS與permission在1280/390完成；獨立負測failclosed、部署fixture排除，以及既有PG17六項完整重用。證據分列synthetic session與SQL权限，真Auth engine明列未測；signOut僅清頁面記憶體，不宣稱server token撤銷。

bounded Review候選保留為離線資產，**等待Owner時段已撤下，不是日常regression前置条件**。真人登入只保留Auth/callback/magic-link/OTP修改、RC、重大milestone終驗、平台強制真人challenge四類；Owner只登入／2FA，其餘由Dot/Codex依當次授權操作。CoreMilestoneProgress=1（無Owner在場的自動驗收入口），maintenance連續數=0。新HEAD以同HEAD CI及父Reviewer核對為準；沒有啟用任何remote批准，P3 marker文案debt不處理。

歷史真人產品驗收基準為 `00446427d1a0e6c9ffa41d035d0704788c9eb481`，branch `feat/passwordless-workspace`／PR #19。父確認 CI `37179033070` success、Preview `FpxCKX9wyxY9doZmt7Y2Dinta1Xh` success；Reviewer `01a1055b-54f8-7751-9ce9-958aa9eee84b` 最終 APPROVE。**bounded-v2 續編保存 → cleanup/closed → 真 logout/reload/login2 → 精確 v2/v1 全 payload 讀回子閉環成立**；詳見 [2026-10-04 驗收](docs/Bounded_V2_續編驗收_2026-10-04.md)。前次 bounded v1／固定 tenant [歷史驗收](docs/Bounded_M3_Fixed_Case_驗收_2026-10-03.md)保留，不重做。

本輪新 envelope 已收尾：實際1 Save／2 login／2 migrations／2 config transitions，history總數23、原21records逐項hash不變；兩個Save entry有效ACL全closed，無待cleanup grant。兩份runtime config為schema=true/save=false、固定revision scope，closed SHA `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`。`2026-10-04T06:00:00.000Z`截止不延展，不再Save/reopen/login或沿用舊批准作新remote。

後續 docs 基準 `04e93edd2bc3a5c42e8b590877cfeb1be170429e` 已由父確認 Reviewer `01a10562` 通過、CI `37179905098` success、Preview `8cqoPREJ45k2n2JsVZZWchgXEvZR` success。依新明確 repo/offline Core 授權，已完成「已保存 URL 成果的確切版本 Review」離線垂直切片：Owner 核對原文／修改／來源／必要事實 → 沿用 content_reviews + audit 原子確認 → 新合成 session 精確讀回；新版不繼承，舊版僅歷史／未發布。詳見[實作、驗證與 remote 缺口](supabase/drafts/url_review/README.md)。CoreMilestoneProgress=1（離線能力）；maintenance連續數=0。

新增 5 API contracts、7 SQL 子檢查、5 native PG17 並發情境、1280/390 各12 UI 情境 PASS，受影響回歸 PASS；候選未安裝，runtime Save／Review 均維持關閉，frozen artifact／closed bytes 不變。本離線Core與CI順序修復後續已由父Reviewer核准（詳下節）；其最新CI狀態與下一候選準備以該節為準，不以本機 PASS 代替雲端驗收。完整 M3、100cap 恢復、remote URL 專用 Review、Publish／Measure仍未完成，不宣稱 live 故障注入。P3 debt：共用 marker 拒絕訊息沿用「續編／保存」字樣，待统一文案時處理，不阻塞本次。下方保留歷史過程，舊基準／批准不取代本節。

## 2026-10-04 bounded Review 候選準備（repo/offline）

正確基準 `2444bd17000e2512f7674367d163e1dd22ed887a`；父確認 Core `15a3706` Reviewer `01a10573` APPROVE_WITH_DEFERRED_DEBT、CI順序修復 Reviewer `01a10575` APPROVE。Preview `DexsE872VFnbb6zDUY5xDLg3SpRa` success；父提供的 CI `37180934357` 尚為 inprogress，未宣稱success。依後續明確Core授權，現已備妥[既有v2的完整bounded Review候選包](supabase/drafts/url_review/bound/README.md)：cutoff=null，固定新request `1f3f43cb-a64c-4739-a4a7-772d5b2cb781`，2 tracked migrations／2 config／2 login／最多1 Review POST與1review+1audit，0Save／parent／version。包含最小schema/RPC/DCL、strict bound open/closed templates、manifest/hash/bind、pre/postflight與DDL/DCL authoritative reconciliation、cleanup及unknown GET-only。

CoreMilestoneProgress=1（候選完整組裝離線成立），maintenance連續數=0。5 SQL子檢查、4 bounded API contracts、5 nativePG17及1280/390各11 UI情境PASS，generic Review受影響回歸PASS；實際兩份runtime仍原Save/Review closed bytes，九檔v2 freeze不變，無任何remote操作。P3 marker文案debt仍延期。新HEAD CI／Preview／Reviewer待父核對；該候選的live時段等待已依Owner新方向撤下；後續若另指定live驗收，仍須完整新批准。本次不綁真cutoff、不寄信、不開窗、不沿用舊06:00 envelope；完整M3／Publish／Measure仍未完成。

## 2026-10-02 產品方向快照（歷史）

URL → First Useful Result → Review → Publish → Measure。電商／貿易商產品頁優先；網址主入口，自動理解與分析，必要缺口才問。第一成果為帶來源、可套用的產品頁 title/meta/描述改善包。plan/work 是內部治理，不是一般使用者的第一價值時刻。

## 2026-10-02 工程資產快照（歷史）

基準 `8a4591b`、分支 `feat/passwordless-workspace`、[Draft PR #19](https://github.com/RC918/Growth-OS/pull/19)。同 SHA [push CI](https://github.com/RC918/Growth-OS/actions/runs/36953102738)／[PR CI](https://github.com/RC918/Growth-OS/actions/runs/36953106748) 及 Preview checks 成功。包含既有 unit／integration／desktop-mobile 回歸、新增 plan/session 19 項測試與離線計畫 E2E。未合併，沒有已驗證的客戶發布／流量成效閉環。

| 資產 | 證據／可重用範圍 | 目前限制 |
|---|---|---|
| Auth/RLS、tenant、版本、approval/audit、固定引導 | [歷史 M1 驗收](docs/Goal_Intake_M1_驗收_2026-09-30.md)及既有 CI | 新成果／發布整合仍需遠端驗收，不重跑既有 PASS |
| 公開 scanner、CSV 與 observation | prototype/public-audit、prototype/csv-import 及 CI | URL 安全入口已接最小預覽；真實量測鏈未接通 |
| 草稿 review、unwired adapter | 0a36de7 與後續 CI，來源／版本／scope／race 回歸 | adapter 未啟用，remote save 未驗收 |
| plan/work-card 契約／memory session／離線 UI | 2d8f7c3、13b7bad、559c033、8a4591b；[證據](docs/Growth_Plan_M2_離線契約_2026-10-02.md) | 改列內部治理／驗收資產；不等於新版 M2 第一可用成果 |
| 靜態 Preview | 同 SHA 部署成功 | 雲端互動未完整驗收，不能代替發布產品內容 |

## 2026-10-02 進行中與待完成快照（歷史）

藍圖 v2.0 已由 Owner 確認（08dbbb7）。目前新增 M1 安全 URL／Source Snapshot／Product Facts 與 M2 第一可用文本預覽最小切片；24 項 scanner/API 回歸及 desktop/mobile E2E PASS，詳見 [驗收紀錄](docs/URL_First_Result_驗收_2026-10-02.md)。新 M1 URL 安全理解、新 M2 可用成果、新 M3 review 接線、新 M4 單平台發布、新 M5 可信效果、新 M6 試點閉環均未全面完成。沒有以舊 M1/M2 同名驗收直接放行新里程碑。

URL-to-source／產品事實與成果預覽已接線；快照 SQLite 仍為本機／Preview 暫存，100cap生命週期未解；固定成果的v1/v2含來源payload已真保存並跨登入讀回，一般產品來源永久保存尚未全面驗收；不再把通用計畫保存／工作卡 UI 擴張當第一優先。具體放行條件與依賴見唯一藍圖，不在本頁另排 M0–M6。

## 2026-10-02 限制快照（歷史）

試點產品網址、發布平台及站點／數據授權尚未建立閉環；它們在 live 整合階段需要對應資訊／登入，不阻擋離線契約與固定 fixture 工程。無真實資料顯示未知，不宣稱 Growth。

package.json 未配置 build/lint/typecheck scripts；Vercel echo build 不是三項品質 PASS。已有 CI／E2E 才是證據。既有 .DS_Store 不納入提交。保持 Growth OS 獨立環境，不改 production、morningai、owner-console、正式網域、模型限額或付費設定。

## 2026-10-02 transport 修復切片

基準 `6663b7f` 的 SafeURL／SourceSnapshot／ProductFacts／FirstUsefulResult preview 與 desktop/mobile PASS 保留。新增重現並修復 HTTP status/header/chunk-header 慢速滴送超過共用 deadline 的缺口；26 項 scanner/API 回歸 PASS，含真 HTTP parser 與本機 socket 測試。詳見[驗收增補](docs/URL_First_Result_驗收_2026-10-02.md#http-parsing-deadline-follow-up-2026-10-02)。新 HEAD CI／Preview 待父獨立核對；PR API Forbidden 不重試。

已重現、尚未修復：main/article 配送／別品文字可能被列為產品事實；100 筆快照後匯出不釋放容量，UI submit/input 清除目前成果，恢復路徑未驗收。下一品質切片優先限制事實與目標產品的關聯；不擴通用 plan/work-card。跨登入保存、SSO 互動、真產品品質與完整閉環仍未驗收。

後續同一 deadline 契約：父已驗收 `1ec65b42`，push CI 37032327865／PR CI 37032335907 與 fresh 1280/390 E2E PASS。再重現 TCP/TLS/send 各自沿用 5 秒導致總計 6–7 秒；本次改共用剩餘期限，28 scanner/API tests PASS，含正常階段、失敗關閉及真 TLS 停滯 elapsed 驗證。新 commit 的 CI／PR 描述由父核對同步；產品事實與容量修復維持獨立切片。

產品事實歸屬切片：已重現配送／別品污染與多商品歧義，改為要求描述／特性與單一產品名稱同屬明確 Product microdata scope；無歸屬、矛盾描述／名稱安全降級。31 scanner/API tests 及 fresh 1280/390 URL E2E PASS；保留快照與引用並加產品 scope 證據。這縮小支援頁型，不宣稱任意未標記頁或真產品品質已驗收。容量／目前成果保留仍待下一獨立切片；本輪不處理。詳見驗收文件 Product fact ownership 增補。

成果保留／容量提示切片：新輸入、失敗、unsupported、取消不再清除最後成功成果；顯示其來源／版本，Copy／Export 保留原始 snapshot，請求錯誤不被匯出提示蓋掉。重複提交與舊 async 回覆有 epoch 防護。32 scanner/API tests 與 fresh 1280/390 E2E PASS，含鍵盤、實際 clipboard/download、版本/hash 及 100 筆 SQLite 逐筆不變驗證。滿額仍拒絕新保存，匯出不釋放容量；未刪資料，真正解除容量待儲存生命週期決策。本頁記憶體保留不等於跨登入／重新整理恢復。詳見驗收增補。

CI 更正：`f0acf9c` 的 push 37036557523／PR 37036563999 均在第 11 次下載失敗，不能以先前本機 PASS 視為已驗收。已確認 Chromium 的 10 次／1 秒下載 burst 限制：實際頁面 49.37 ms 觸發 11 次僅 10 次下載，超過 1 秒後恢復。只修 E2E 下載節奏，保留全部鍵盤／內容／hash 斷言並要求每 viewport 12 次真下載；fresh 本機 1280/390 PASS。CI 145 瀏覽器安裝遭 CDN 403，本機用既有 151；新 HEAD CI 仍需父驗收。產品程式未改。

真頁品質有界評估（2026-10-02 17:08 UTC）：父已確認 `8f1f17c` 兩組 CI 37037554882／37037562443、Chromium 145、32 scanner/API 及 1280/390 各 12 真下載 PASS，原 CI blocker 解除。最多 3 個公開示範商品 live 本機嘗試均停在 robots（2 DNS 失敗、1 次 5 秒 timeout），0 商品頁／0 snapshot／0 preview，不能宣稱真產品品質或 unsupported 分類已驗收。已保存[短記錄與 Preview 最小驗收方案](docs/Public_Product_Quality_2026-10-02.md)；沒有改抓取限制或功能。下一步需父核對精確 Preview head、Owner 自行完成既有 SSO 後的窄範圍驗收；無新登入設定、清理或儲存架構變更。

父的受限 Preview 觀察：17:37 核對 `3ad934a`／deployment `GQKPriANVwhGWtoickXj2s8rCdZa` 與 alias；兩次指定 URL 提交分別 robots 停止與名稱已識別但描述歸屬不足，UI/request/fallback 有證據，真有用成果仍未通過，snapshot 寫入數未知。依父唯讀 WooCommerce DOM 證據，新增狹窄單產品 summary/title/short-description 歸屬路徑，保留 microdata／引用，歧義降級；35 scanner/API tests、fresh 1280/390 各 13 次下載 PASS。這次只有合成 fixture／本機回歸，真 ScrapeMe 重測待父另處理授權，未追加 live 請求。詳見真頁評估與驗收文件增補。

Woo／microdata 重疊 review 修正：`874d071` 原 CI 綠燈不涵蓋優先序 regression，父暫未驗收。已重現後修為保留有效 microdata，Woo 只補缺值且不丟 features/citations；visible name 或跨格式描述衝突安全降級，空 Woo 描述不覆寫有效 source。38 scanner/API tests、fresh 1280/390 各 15 真下載 PASS，含 mixed 成功與衝突保留舊成果。無額外 live/model 請求，新 HEAD 待父獨立 review／CI；真頁品質未新增 PASS。

首次 live Preview 成功（父證據，2026-10-02 23:52 UTC）：核對 `9874e6b`、兩 CI success 與 deployment `H7TGnzpVFaaYXSuUuSkKyitrKs64`／alias 後，單次 Bulbasaur 得到三份文本與可追溯引用；fetched_at `2026-10-02T23:52:48.839429+00:00`，fingerprint `fb43e63ad4cda608d8ee1edb4ac4614e04652f56b233ae0be31cc5d191ac4361`。詳見真頁評估增補。雲端 Copy 讀回空、Export 等待發生工具 kernel timeout，內容／檔案未獨立驗證；不先判為產品 bug，不代表全 M1/M2／發布／流量完成。

合成重現後修正描述已以完整產品名開頭仍重複加名前綴；保留原句、facts 與引用。25 項受影響 Product/API tests、fresh 1280/390 各 16 次真下載 PASS；未重跑無關 suite，未改 Copy/Export 實作，未追加任何 live／模型請求。新版 CI／真頁修復後品質仍待父核對。

## 2026-10-03 第一成果本頁 Review

父已獨立驗收 `821aab584a295843a588c09d8fdf33d4e0619d37`，push CI 37080100879／PR CI 37080104447 success，Preview `5kCwsw8Xc1yXN8rjFiAfYsKGzPEp` Ready。本次在該基準接通三欄原地編輯、相關事實核對、取消還原與版本確認；編輯／來源變更撤銷舊確認，延遲操作不能覆寫新版本。Copy／Export 使用目前可見版本，保留來源 bytes hash，內容 digest 與本頁確認另列。明示本頁已確認／未保存／未發布，不作權限或永久保存證據。

契約 6 tests、受影響 API 3 tests、最終 1280/390 E2E 各 22 真下載 PASS；最後程式驗證後僅補文件，未重跑無關 PASS。詳見 [Review 驗收](docs/First_Result_Review_驗收_2026-10-03.md)。新 commit CI／Preview 待父獨立審查；沒有新增 live／模型／遠端 DB／Auth 操作，完整 M3、持久保存與發布／量測仍未完成。

父已接受本頁 Review `1a21d5486c1640b591aa686944767d99d208b307`：push 37082152873／PR 37082156670 success；logs 39 scanner/API、6 Review contracts、Chromium 145 1280/390 各 22 真下載，Preview `ErnefHeALQZuKdtatikv6CGHDcNx` Ready。本頁確認仍非持久 owner 授權。

後續最小切片僅新增未接線 First Result save-intent 純契約／validator：完整保留匯出與獨立 fixture context，重算來源／內容／完整請求摘要，缺映射或資格拒絕；輸出只 draft candidate，明示 legacy title 160／title-body 與三欄 2000／來源 Review 不相容。11 項針對性合成測試 PASS；新 CI 待父核對。沒有 migration／RPC／generic review 改動、adapter dispatch、Auth／UI 接線、remoteSave 或新 store；不把完整 Business Profile 帶回 URL onboarding。詳見 [save-intent 契約與限制](docs/First_Result_Save_Intent_契約_2026-10-03.md)。

save-intent 父審查修正：`69ce9b1` 兩 CI 37083625550／37083629483 綠燈但 HOLD，因必備 evidence 可缺漏及長 Unicode 原建議誤拒。先補回歸重現 11 PASS／2 FAIL（114 個結構破壞案例中 80 個誤收、真 builder 長原建議 INVALID_FIELD_SIZE），再最小修為完整 producer typed evidence／unknown 檢查，2000 限制僅用於目前編輯欄。最終 14 tests PASS，原建議／來源無損，合法 Woo／microdata／usage 合成案例仍通過。僅純契約、fixtures 與文件，無遠端／UI／RPC／migration；新提交待父審查，詳見 save-intent 契約 P2 增補。

## 2026-10-03 未部署 First Result 保存 SQL 草案

父已接受 `9ea837b82a490bd2affef85e661049db431127fd` 的兩項 P2 修復：CI 37084305511／37084307932 success、14 save-intent／6 Review／39 scanner/API、1280/390 各 22 真下載，Preview `2RcV3YMjLdzmV7cPkzGwu2pjKG22` Ready。Owner 01:36 UTC 同意下一個離線 SQL／隔離 DB 切片，仍未批准遠端真保存。

新增 [未部署草案與驗收](supabase/drafts/first_result_save/README.md)，位於 migration runner 不載入的 drafts 目錄。只擴 content_versions 四欄／條件約束與 org-request 唯一鍵、owner append RPC、必要 private validators、typed generic-review guard；保留三欄／長原建議／來源、原有 tenant／門檻／共用版本與 audit。沒有新 store、Profile onboarding、Auth／UI／dispatch 接線。

PGlite 13 個群組（Node 含外層 14 tests）PASS，含 114 個證據破壞拒絕、Unicode／來源與內容摘要重算、完整讀回、冪等與異請求拒絕、membership 撤銷、audit 回滾、typed 審核拒絕及 legacy 相容；合成 20 表原欄位、13 筆歷史與帳務比較不變。PG17.6 腳本語法 PASS，但實跑因本機缺固定映像 BLOCKED／exit 2，未下載或啟動容器；真多連線競爭尚缺證，CI 新步驟待父核對。所有 SQL 只在本地合成 DB 執行，沒有遠端資料／權限變更；真 Auth／保存／一般新用戶流程仍未放行。

保存 SQL 草案父審查增補：`c9ab0d8` 的 CI 37087663932／37087667022 已補齊真 PG17.6 原三案，Preview `CE4aQ6ZDS2q6m3BwBvz6fMp3SZK9` Ready；但三項 P2 HOLD。新增回歸先得到 PGlite 15 PASS／2 FAIL，完整重綁 URL／引用／receipt／digest 後仍重現非法 authority／port 誤收。trim 在 PG18.3 未重現（`E'\v'`→0b），改用 chr(11)，保留 PG17 專屬原寫法對照。org lock 改 NO KEY UPDATE 以容許 legacy FK KEY SHARE；新增原模式 deadlock 控制、legacy create/review 混合及三種 membership 撤銷重疊 assertions。最終 PGlite 16 群組／含外層 17 tests PASS，51 URL differential 案例完整通過；native 語法 PASS，本機仍缺 image，新增真 PG17 案例待新 CI，不能當作已重現遠端故障。僅離線 SQL／合成測試與文件，未部署、未碰遠端權限或資料。

PG17 trim 判定更正：`db953e5` 的 CI 37088718035／37088720542 在錯誤控制預期失敗；父讀得 PG17.6 實際 `0b/true/true/false`，與 PG18 一致，已撤回 trim bug 判定。chr(11) 僅為明確等義寫法。本次只修 native 預期／標籤及文件，SQL 不改；URL／鎖修法已獲父靜態接受，但新 mixed legacy／typed、三個 membership revoke 時序與保留斷言因前項中止尚未執行，下游 browser／closed-gate skip。全部 assertions 保留，待新 CI 完整執行與父驗收；沒有遠端操作。

父已接受 `16ef57627fbe1409e675d60b33559990de34ffcb`：push CI 37089011426／PR CI 37089015968 success；實際 PG17.6 trim 等義、51 URL、舊鎖 legacy create/review 40P01 對照與修正後 overlap、三種 membership revoke 時序及 1280/390 各 22 次下載均通過。這是父獨立提供的驗收，解除上一段等待；仍只接受未部署離線 SQL，不是遠端保存／Auth 批准。

## 2026-10-03 Workspace typed draft 唯讀相容性

既有目前／歷史卡片新增 typed 三欄全文、原文／原建議／修改／facts／inferences／未知／引用／來源與內容不同摘要／page-only 歷史確認。typed 或可辨識但缺損的 typed 一律阻擋 generic review、兩欄修訂與執行方案，不採信混入的 approved review；legacy 保留。舊卡片、重複操作、刷新逆序、晚回覆及頁面返回有失效防護。

10 workspace API／鏡像 tests、合成 transport 的實際 workspace renderer 1280/390 E2E PASS；每 viewport 三個 legacy mutation、零 typed mutation，完整內容／長 Unicode／HTML 安全／缺損資料／混合歷史／鍵盤與無溢出均覆蓋。新 CI 步驟已接，提交後 CI／Preview 待父核對。详見 [唯讀驗收與限制](docs/Typed_Draft_Workspace_唯讀驗收_2026-10-03.md)。

遠端 SELECT 未改，fixture 刻意補入 typed 欄位，僅驗 renderer 相容性；真實傳輸仍缺 typed 辨識／按需 payload，不能宣稱跨登入恢復完成。無新 Save／RPC／Auth 接線、遠端 DB 或模型／live fetch；未部署 SQL、不擴 Profile／Plan 入口，完整 M3 仍未放行。

Typed UI 父審查 P2 修正：`1964f6e` 的 push 37089871698／PR 37089874941、typed 1280/390 與既有回歸綠燈，Preview `4sg87bsJs2ZW7EbMJeg7pBxSw8TQ` Ready，但父 HOLD create 成功訊息誤歸屬。先以 UUID fixture 重現兩 viewport 各兩案 FAIL：RPC 回 v2，但 dashboard 最新 v3 或仍為 v1，都誤貼 badge。修為捕捉回傳 version UUID，資料與 DOM panel 均精確相符才顯示版本成功；缺讀回／新版變動只中性提示，保留晚回覆失效防護。fixture 每次 pageshow 等待自己的 response render，缺損 payload 逐值核對；原錯誤 synthetic-result／v1 成功假設移除。

修正後 1280/390 完整 typed E2E PASS（正常 v2、新 v3、缺 v2、新 render 後晚回覆各案），每 viewport 六個合成 legacy mutation、零 typed mutation；API／mirror 10 tests PASS。詳見同一唯讀驗收文件 P2 增補；新 commit CI／Preview 待父驗收。未改遠端 SELECT／API／Auth／RPC，未接真保存或操作遠端。

父已獨立接受 `95a2e679a5078117011bcbfe4c1d2eb8f0665b83`：push 37090367455／PR 37090371967 各 39 steps success、無 skip；10 API/mirror、typed 1280/390 normal/newer/missing/late UUID 四案、零 typed mutation 及既有 full suite 通過，Preview `HjobjeH4qHVULe1JWNv8enHzKViY` Ready。只接受離線 renderer 相容性，remote SELECT 未變。

## 2026-10-03 單句停寫部署候選製作（當時未遠端執行）

依父已提供的唯讀 fixture／工具契約，新增 drafts 中的單一 invoker DO [候選包與完整限制](supabase/drafts/first_result_save/CLOSED_PACKAGE.md)。保留已驗 proposal 的 DDL/function bodies，只移除原交易包裝及兩行永久 authenticated GRANT；內層 exception 子交易暫授保存、固定身份與 parent 驗 1 version/1 audit、重送／拒絕／完整讀回，成功 marker 才回滾測試與 grants，外層核有效停寫／原資料後正常完成。無新 store/UI/Auth/API/刪除資料路徑，沒有 migration discovery 接線。

PGlite Node 1 test／七組檢查 PASS：固定 actor 拒絕、authenticated 下與完成測試後真正非 marker failure、過早 marker、內層回滾後最終 failure、繼承 EXECUTE 洩漏拒絕，以及成功安裝保持停寫。原 20 表投影（含 legacy draft/review）、13 history/audit、非零 ledger/attempts 與 caller role/claims 保留；測試 rows 持久 0。native 語法 PASS；PG17.6 本機缺固定映像，啟動前 BLOCKED/exit 2，未下載。新包已接既有 PG17.6 CI runner，尚待父讀新 SHA logs。

hosted applyMigration 僅 POST name/query 並回 success，不提供已證實的 schema＋migration-history 原子性；本包不聲稱解決此未知。未来需父獨立審 hash＋Owner 批准一次正式隔離 migration，預期 history 18→19；未知結果先查不重送，不刪 history／資料。未連遠端、未讀 secret、未登入、未部署或觸發模型／商品請求。


## 2026-10-03 04:10 UTC 停寫部署完成（父提供）

Owner 04:01:01 批准 03:32 提案的限定一次 remote closed deployment（`Sentinel_ae3797f439c081918dec7fa3929e6d89`）。父於 04:05–04:06 只 apply_migration 一次：project=`vhzryhibmpvglzcmfnaa`、name=`first_result_closed_package`，使用 `a150bebbe549f862c41dd93a16ea72cd4a74e626` 的 SQL，SHA-256 `6a711df72cdf5bd5700f7148aa98b1982ca1209c5b5fe2fdf48a3a1288275beb`；tool success:true。

父 04:10 獨立 SELECT-only postflight PASS：總 migration 18→19，新增 `20261003040602 first_result_closed_package`，持久 statement 52,447 bytes／hash 精確相符。15 新函式 body/signature/flags、postgres owner、empty search_path、僅 private save impl 為新 definer 均吻合；PUBLIC/anon/authenticated/service_role 有效 EXECUTE 全 false、無 non-owner grantee。四欄／約束／typed-review guard 正確；24 relation/subset count＋SHA 不變，20 業務表共 87 rows、audit 30 rows、原 goal 13 history、ledger 與 2 settled attempts 保留。Typed rows／first-result audit／測試 request IDs 持久 0。**19 是 migration 總數，13 是 goal history 筆數。**

既有 3 ancillary functions 與 review 有獨立快照比對；其餘既有 functions／PG role membership 由 exact package 內 security assertions＋apply success 支持，沒有誇稱全數都有獨立外部快照。詳見 [停寫部署紀錄](supabase/drafts/first_result_save/CLOSED_PACKAGE.md)。

唯一 remote attempt 已用完，30 分鐘窗口不是額外授權；不重跑 migration、不開 grant、不 reconcile 本地 migration filenames。沒有真 JWT/API/login/Save/跨 session 驗收，remote SELECT 仍未改。此次 agent 只記錄父的結果，未連遠端或重跑實作測試。後續 schema＋history 一般原子性仍不能由本次成功推定。


## 2026-10-03 Workspace typed 按需讀取契約

父已接受文件基準 `be01425ce4bbd3a2ab5406ee5420433ae894b256`：push CI 37096055203／PR CI 37096057823 各 39 steps success，Preview `5oedbDN14M88Xr1g9T7vZn5GCZTe` Ready（父提供證據）。此前各段「SELECT 未改」為各切片當時狀態，最新本地接線如下。

現有版本列表新增三個 scalar metadata，payload 只在使用者展開單版時以當前 org＋精確 UUID GET。回應 org/id/parent/version/metadata 與列表投影一致才顯示；metadata 缺失／矛盾 fail closed，不回退 legacy。手動重試、重複展開與收合／歷史收合／刷新／登出／session 更換／晚回覆防護保留；apps/web 與 prototype 鏡像一致。

最終程式既有驗收：13 API/mirror tests、嚴格 SELECT projection 的 1280/390 合成 E2E PASS；每 viewport 六次 legacy mutation、零 typed mutation。logs 04:35:14 晚於最終程式修改 04:35:03；收尾僅補文件，不重跑無關 suite。詳見 [按需讀取驗收](docs/Typed_Draft_Workspace_唯讀驗收_2026-10-03.md)。新 SHA CI／Preview 待父獨立驗收。

沒有遠端查詢、Save、登入、grants、SQL／migration 或新 Auth 流程；單次部署批准已用完。合成讀取通過不等於真 RLS／Data API／跨 session 恢復驗收，不放行完整 M3 或發布／量測。

## 2026-10-03 URL-first 待審保存：離線整合

父已接受 `2a33ef49e2a35cea7a35648d1dad1a12212c4f6d`：push 37097416575／PR 37097419698 全 39 steps success，Preview `defz8iRhLPEruDLNJZ4XWkHEjRHt` Ready。Owner 05:14 同意 04:55:45 的 URL 待審保存方向；不先 Profile／approved opportunity，僅設計與離線驗證，遠端另批。

新增 growth_opportunities 的互斥 URL subtype／固定待審／immutable source identity、專用原子 Save 草案，沿用 content_versions、tenant RLS、org/request 冪等、版本與 audit。首存 1 parent＋1 version＋1 audit，追加 1 version＋1 audit，拒絕／重送零新增；五個舊 mutation impl 拒 URL，新 Save 拒 legacy，舊 gate 保留。草案不在 migrations，歷史 closed-package SQL/hash 未改，新入口 EXECUTE 全 closed。

實際 product Review→同 origin 指定視窗一次 nonce 交接／完整 JSON 匯入→workspace 唯讀確認→專用 API→精確版本讀回已組裝；無損沿用 export，沒有重新建立 editable Review／demo／store。瀏覽器 dispatch 預設 false；不要求未部署新欄位。owner-only，editor/viewer 只讀；無帳號／無 membership／多 membership 不自行配置資格。未知結果只查原 request、不 retry；page confirmation 非 owner approval。

離線證據、檔案差異、完整命令與限制見 [URL 待審保存候選](supabase/drafts/url_result/README.md)。本地 46 unit/API/mirror/SQL tests、URL Save 1280/390 實際 UI＋隔離 SQL、既有 typed 1280/390 及 product 1280/390 各 22 下載回歸；PG17 新並發本機缺固定 image／exit 2，已加 CI，待父獨立驗收。沒有遠端 DB/Auth/Save/grants/live 商品抓取/模型/費用或部署操作；不放行真保存、一般新用戶 provisioning、完整 M3 或發布／量測。

URL 保存父審查 HOLD 修正：`97ce6ede23032c60e19546f3fc8975a360aad758` 的 push `37100438616`／PR `37100440301` 在 native startup 失敗，URL 並發 assertions 未到、後續 browser skip；Preview Ready 不代替驗收。原 SELECT-only readiness 誤接受 Docker 暫時 init server，現沿用既有 PID1=postgres＋SELECT 1＋PG17.6／listen_addresses 核對，合成控制 FAIL→PASS；本機缺固定 image，真並發仍待新 CI。

另先重現三項 P2：五個 SECURITY DEFINER 舊入口在 auth 前查 subtype，75 組未授權組合中 25 個 URL 目標洩漏不同錯碼；兩 viewport 八案取消／修改／刷新／pagehide 於 async digest 暫停後仍 POST，四案讀回失敗後手動對帳誤接受 RPC A 以外 UUID B。修為原 owner/org auth 後才查 type、POST 緊前同步 live intent/session guard、unresolved intent 持有回傳 UUID 並每次 GET／顯示前核對。修正後受影響 28 tests、12 個 browser 邊界案例、1280/390 原 URL 保存整合均 PASS；詳見 [FAIL→PASS 證據](supabase/drafts/url_result/README.md)。新 SHA CI／PG17／Preview 待父獨立驗收；無遠端操作，closed gates 與歷史 SQL hash 保持。

## 2026-10-03 bound URL 離線候選包

已凍結唯一合成 export、新 parent/request、actor/org 與 hashes，提供既有 URL Save impl 內固定 gate、兩份非自動部署 opening/cleanup SQL、明確 UTC／既有 Preview URL 必填 renderer，及 GET-first／unknown GET-only／fresh readonly UI。實際分支 schema/save 仍 false、trial null；未做任何遠端 DB/Auth/POST/模型操作。詳見 [候選包與證據](supabase/drafts/url_result/bound/README.md)。本機 28 tests、Chromium151 的 1280/390 bound 與原 URL E2E、12 races PASS。PG17.6 因本機缺指定 image 明確 BLOCKED、未下載；新 CI／Preview 由父驗收，實際截止 UTC、Preview alias/callback 與遠端批准仍待綁定。

## 2026-10-03 bounded 同 tab 防重送修正

父對 `6bab3bef` 指出 unknown POST 後 reload／空 GET 可重送；先在 1280/390 重現第二 POST 的 FAIL，再加入僅限本次驗收的 sessionStorage 非敏感 metadata。固定 scope/expiry/request、attempted 與 known UUID 在 POST 前同步寫入／讀回，reload/relogin 只 GET；錯誤或不可用標記 fail closed，logout/cleanup/expiry 不清除。21 API/marker tests 與兩 viewport 的 unknown／acknowledged UUID、bad storage、cleanup/expiry cases PASS；原 E2E/races 保留。SQL、候選 hashes 與 false/null flags 未改，沒有遠端 DB/Auth/POST。限定同一受控 tab，不宣稱跨新 tab／裝置的全球一次 HTTP；詳見 bound README。

## 2026-10-03 M3 真保存／重新登入成果與必要 tenant 驗收補口

父端提供、Reviewer 總驗 `01a10328` 核對：18:26 既有 Owner login1，18:48–49 唯一一次 Save；18:50 authoritative 證明固定 parent `9bafbb2f-eea7-48ea-bc23-3896897f19c3`、request `4d602b3f-272f-4282-9906-b0cc0155e1c7` 對應 1 parent／1 version／1 audit，version UUID `4595e34a-0b2d-4a73-984b-d7439b52325c`，payload/request digest 吻合。cleanup、ACL/history、資料 preservation，以及 logout→login2→精確 readback 已獲證實。closed config commit `e645de8b97c0d40aa52ee2843e15f3d6a120b934` 保持 schema=true/save=false；原 19:30 UTC SQL lease 不延展、不再 opening 或 Save。

CoreMilestoneProgress：本輪從離線候選進展到真保存、跨登入讀回與 cleanup。完整 M3 **尚未完成**：Reviewer 判必要 P2，缺同一 signed Owner 對確有資料、但無 membership 的 OrgB negative GET。父 19:08 authoritative SELECT 已證 OrgB parent `93a88055-0a0b-40c0-b22f-a6d3123c0002` 存在，該 Owner 在 OrgB membership=0；舊 viewer 控制不能替代此驗收。

本次 Blocking 修復僅提供固定 Owner／OrgA、schema 開/save 關的唯讀診斷，沿用既有 authenticated client。OrgA 精確 1 row 是正向控制，OrgB 成功回應 0 rows 才能通過；HTTP/網路/格式錯誤不能當隔離 PASS。固定最小欄位與 IDs，無任意輸入／token 匯出／POST／新 fixture、DDL 或 ACL；登出與晚回覆失效保護保留。合成 API/UI 證據不替代待執行的真 signed negative GET。

依父轉述的 Owner 17:26 envelope（`Sentinel_10d81d4907e0819193fc417ce458fc71`，含 CI/E2E/login/logout/readback/tenant 驗收、至 M3 完成），最小操作計畫明確修訂：增加 1 次既有 Owner login，**累計 3 次**，追加 1 次唯讀診斷 Preview 部署。這超出原 manifest 的兩次登入／兩次 config 部署計畫，並非宣稱仍在原預算；不增加 Save／DB mutation，不延展 SQL 技術 lease。父於確需人工登入時通知 Owner；此 executor 未操作遠端或登入。待 CI／既有 Reviewer／Preview 核對後，由父完成這唯一缺口，再判定 M3；不啟動其他功能。

本地驗證：23 API／marker tests 通過；新增固定 Owner 診斷 UI 1280/390px 通過 positive/negative/error/leak/wrong actor/logout-late-response、零 POST；原 typed UI 1280/390px 回歸通過。新 UI 已接既有 CI。兩份 runtime config 仍為 reviewed closed SHA256 `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`；所有 SQL／payload 未改。新 HEAD 的 CI、Reviewer、Preview 與 live negative GET 待父端確認。


## 2026-10-03 19:27 UTC bounded M3 fixed case 收尾

本段更新上述「尚缺 negative GET／待 CI」的歷史狀態。父在 `19:27:19.973Z` 的第三次真 signed Owner session 點一次已審核診斷，OrgA 固定 parent 精確 1 row，OrgB 既有 parent 成功回應 0 rows；結合 19:08 authoritative 存在性／無 membership 控制，必要 P2 已解除。Reviewer 最終 APPROVE，且父已通知 Owner 此完整子里程碑成立；不是全產品 M3 或 v2 專案完成。

[驗收記錄](docs/Bounded_M3_Fixed_Case_驗收_2026-10-03.md) 保存完整 IDs、時序、1 Save／3 login、DB history 21／ACL closed、證據來源及未驗範圍。CoreMilestoneProgress 是使用者真保存後可重新登入讀回同一成果、固定 tenant 隔離已實測；本次文件 commit 本身不另計產品能力。下一 Core 僅提出既有成果續編／取消恢復的離線切片供父分配，不重做已 PASS、不新增診斷或處理 P3。


## 2026-10-03 已保存成果續編／取消恢復：離線 Core

父接受 `7563bd2` 文件（Reviewer `01a10343`、CI `37148329617` success、Preview `AkEUDCrgq54cYkoSeBTP4U959rYm` success）後，明確分配本次普通 repo/offline 工程。現在 Owner 可从已保存最新 URL draft 精確讀回進入既有 Review 引擎；保留來源、原建議及已存修改，清除舊確認；取消回到原已保存版本。viewer 仍唯讀，進入／確認重新核對最新版本，來源／tenant／session 漂移與晚回覆拒絕。沒有新 store、schema、ACL 或 Save 接線。

本地 32 unit/API/mirror tests、新續編 E2E 1280/390、既有 typed 及 URL Save 合成 UI 回歸通過；新測試接入既有 CI。詳見 [離線驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md)。closed config／所有 SQL／frozen payload 未改，既有遠端 1/1/1 保留且未觸碰；没有 live POST／login。CoreMilestoneProgress 是已保存版本可安全開始本頁續編並取消恢復的離線能力，不計為第二輪 live M3 驗收或完整 M3 完成。


## 2026-10-03 續編的新版本保存意圖（repo/offline）

父提供上一切片 `2db5c0b0395b988abd0f3e65d51d8e3e25e993f0` 的 Reviewer `01a10352` APPROVE、PR CI `37149280839` success、Preview `6LAs5AnjEuyGxqqWfNbNoKMDiUpc` success，並分配本次最小 Core。續編確認後現在可準備新的保存意圖；沿用 URL Save 五欄 request，綁定已存 base UUID、expected version、重新核對的 actor 與本地 intent digest。意圖不是保存、owner approval 或發布授權。

建立前重新 GET 同一 Auth user／Owner membership、URL parent、最新版本及精確 payload，拒絕錯 actor/org/UUID/version/source、malformed、過期 base、取消或替換 session／晚回應；來源與原建議完全保留。修改使舊意圖消失，取消回到原已存版；不鎖住跨 session 未來變更。`saveUrlResult` 仍 closed，不新增 store、SQL、schema、ACL 或 dispatcher。

27 API／marker／mirror tests、新版意圖 UI 1280/390 通過；既有 URL SQL isolated PGlite 10 tests 通過，新增組裝驗證使用實際產生的 intent 追加 v2、相同 request 冪等返回、v1 保留、舊 base 拒絕，隔離資料量 1 parent／2 versions／2 audits。這不是改動遠端既有 1/1/1。原生 Date 的測試轉接層已改為真 JSON roundtrip 後 PASS；沒有變動 SQL 契約或部署包。詳細限制見 [續編驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md)。新 HEAD CI／Reviewer 待父核對，沒有 remote/login/live POST 或 lease 延展。


## 2026-10-03 完整續編保存／精確 v2 讀回（offline，runtime 仍 closed）

父確認 `101185d229f75c0370d6781e9fc248a5f49f437a` 已由 Reviewer `01a10360` APPROVE、PR CI `37150266068` success、Preview `C3fbf5TPnERXbcEeQYXxTkzxTJ6o` success。依下一最小 Core 分配，現已把同一續編 editor／意圖接到既有 `saveUrlResult`、隔離 SQL 及精確 v2 reconcile；沒有新增意圖層、store、SQL 或通用 retry 系統。

保存前重新核對 actor／Owner membership／base UUID／expected version／完整 payload 與意圖摘要；最後仍走既有 Save flag、bound gate、session／同步 live guard。合成回應成功後必須精確 UUID、creator、org、request、版本、draft status、payload 讀回吻合才顯示 v2 成功，v1 仍保留。已送出結果未知或衝突只查原 request、不重送；衝突保留修改供複製／核對並停用保存，不自動換新 base。取消已送出操作只停止等待，不能宣稱回滾；仍可 GET 核對已提交結果。

28 API／marker／mirror tests 通過；新完整 UI 1280/390 各 success、unknown、SQL conflict、cancel、logout、wrong-readback 六案通過，每案僅一個 synthetic POST、isolated 1 parent／2 versions／2 audits、v1 原樣。既有續編／意圖 UI、URL Save 與 12 races 回歸通過。這些是 synthetic transport＋disposable SQL 的 offline 結果，不是第二輪 live Save；兩份 config exact closed、所有 SQL／bound artifact 不變，沒有 remote/login/live POST／費用／lease 延展。新 HEAD CI／Reviewer 待父核對，完整 M3 尚未宣告完成。


## 2026-10-03 v2 保存後新 session 恢復與 v1 歷史（offline 完整流程）

父提供 `e7209e7ee1e77bf6c73a594cad4296f29ca35623` 的 Reviewer `01a10370` APPROVE、PR CI `37151322250` success、Preview `HHaXKYiwoVZ7Eqjiybyns2reWzDg` success。先檢查既有產品能力：dashboard 已依 DB 版本建立最新／歷史清單、按 UUID lazy GET、Owner 最新 draft 才能續編，結束 session 會清除舊 DOM。新整合測試證實這些能力足以完成本 slice，**沒有產品缺口需要新程式或新 store**。

擴充同一 `saved-result-save.e2e.mjs`：真 DOM 合成保存 v2 後結束 session、關閉舊 browser context、以新 context／新合成 token 登入同一 isolated DB，精確 v2 UUID／完整 payload 及 v1 完整 payload 讀回；僅 v2 有 Owner 續編入口。再以新 viewer session 驗兩版唯讀、新 foreign tenant session 驗既有成果不可見，並驗錯版本回應／登出後 late detail 不渲染。1280/390 均 PASS；每 viewport 僅原一次 synthetic POST，新 session 全 GET，DB v1 全 row 不變、維持 1/2/2。不是重新執行 live 登入，也不是新 runtime 功能宣稱。

M3 的已完成使用者閉環與剩餘項已集中列於 [續編驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md#m3-使用者流程收斂與剩餘項)。本輪 CoreMilestoneProgress 是完成跨新 session 的整合證據，不另拆更多已 PASS 成功路徑。主要剩餘 repo Core 是「unknown 保存後離頁／新 session 的安全核對與成果恢復」；只提出一個完整流程供父分配，不在本輪展開。現有 editor 生命周期限制仍在，不能據此 live rollout；遠端 fixed-case envelope 已收尾，仍禁止新 remote/login/mutation。P3 不追，完整 M3／Publish／Measure 未完成。


## 2026-10-03 同 origin/tab 未決續編恢復（一次完整 offline Core）

父確認 `ea87cc0acaa45a9120f5fde9c0aedcec68c2c402` 的 Reviewer `01a1037d` APPROVE、PR CI `37152160413` success、Preview `48jS9KPVHYhA4ZdMJ9wqWngcAQNm` success，分配同 origin/tab 跨 editor、reload、logout/login 的單筆 unknown 恢復。本輪在既有 sessionStorage marker 模組新增獨立 revision key，原 fixed-trial 函式 bytes／key 與 frozen artifacts 不變；不建立其他持久 store 或通用重試框架。

dispatch 緊前同步寫入／讀回核對單筆識別與摘要，storage 拒絕／no-op／損壞 fail closed；token、payload、修改文案均不入 storage。未決 request 不可換號，連既有一般 URL append 入口也不能繞過重送限制。跨 editor／reload／logout/login 後只有原 request／known UUID GET，依重新核對的身份、membership、base、版本、來源及 payload／intent 摘要恢復；空 GET 維持 unknown。成功精確核對後才標 resolved；晚 ack 不可覆寫下一筆 metadata。

32 API／marker／mirror tests PASS；1280/390 完整組裝 28 案（既有 14＋本輪恢復／storage 14）PASS，含已提交 unknown、未提交空 GET、known UUID mismatch、錯 actor、損壞 pending reload、拒絕／no-op storage；恢復不新增 POST、v1 完整不變。既有續編及 URL Save 桌面手機回歸亦 PASS。初次合成新登入失敗因同頁僅改 hash 沒有 document load，已改同 tab 真導頁後通過，沒有放寬身份防護。

明確限制：僅同 origin／仍存在的 tab；不保證 destroyed tab/context、跨設備或人為清除 sessionStorage。未落庫文案只留原 editor 記憶體；reload 後若 GET 空，不能用摘要重建修改，必須明示 unknown；若已提交，從精確 DB payload 恢復修改。已解本輪限定恢復流程，不能因此宣稱全面 live rollout；新 v2 remote／完整 live role matrix 仍未驗收，實際 Save closed、舊遠端 envelope 已收尾。沒有 remote/login/live POST、新 SQL、ACL、費用或 lease 延展。詳細 scope 見 [驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md)。


## 2026-10-03 新 bounded v2 驗收準備（offline candidate only）

父確認 `495516b71d20bd975f6f1afa88eb160883409160` Reviewer `01a1039a` APPROVE、PR CI `37153710795` success、Preview `BTuUpxFXMNHJJU7EVK8dQnNMk6NX` success。新 Core 收斂為已保存 v1 真續編一次 → 新 bounded v2 保存 → 重登入精確 v2/v1 history；原 first-case envelope 已收尾，不能沿用舊批准。

已交付 [完整候選與安全順序](supabase/drafts/url_result/revision-bound/README.md)：固定原 Owner/org/parent/base，唯一新 request，既有 Review engine 從原 payload 產生 frozen v2，expected1；僅既有 private implementation 窄patch template＋保留資料的tracked cleanup＋readonly pre/postflight。cutoff=null，不猜 Owner 可用時間、不做短期freeze。隔離PGlite 7 tests PASS，驗基準漂移、錯bound、到期rollback、最大增量0parent/1version/1audit、v1全row不變和closed讀回。

CoreMilestoneProgress：新 bounded v2 的可審核 scope／payload／SQL 離線可行性成立，尚未形成 live 使用者驗收。現有 trial 預期0而續編入口要求無trial，需最小revision discriminator接線與desktop/mobile/nativePG驗證後才可由父整包向Owner請新批准；本輪未實作runtime接線，不能直接開旗標。沒有新架構、remote、login、live POST、實際config或既有frozen artifacts變更。準備結果交父review，不自動開始遠端或其他Core。


## 2026-10-03 bounded-v2 完整 repo 整合（未遠端啟用）

父确认 `d5f1eb11a04d2e17808559fa767fc4e0db3bca55` Reviewer `01a103a8` APPROVE（僅候選準備）、CI `37154980520` success、Preview `PzDAAkV8a8RJXUVY4BG3ZV6FbUtx` success，再授權完成同scope整合。本輪 `kind:revision` 固定 expected1/base UUID/request/full payload/intent，沿既有config/editor/API，保留firsttrial；不設trial=null泛開、不新增store/framework/意圖層。revision trial不建立firstSave匯入面板；generic Save無法繞過saveUrlRevision，resolved固定request也不可再次POST。

CoreMilestoneProgress：同一v1→單次title edit→精確意圖→一次synthetic POST→unknown原request GET-only→cleanup/closedconfig→logout/reload/login2→exact v2及v1 history 的完整bounded流程已離線成立。1280/390共16案PASS（成功與unknown至多1 Save POST、每案恰2 synthetic OTP requests）；一般續編28案與舊firsttrial4組回歸PASS；API/marker/mirror/候選42tests PASS。固定PG17.6原生6組鎖/截止/並發去重/到期重放/撤權讀回驗證PASS，v1不變；本機缺image時先取得與CI相同公開pinned依賴，容器network=none且無hostports，沒有遠端Supabase操作。

[完整包與操作順序](supabase/drafts/url_result/revision-bound/README.md) 修正為open部署/reload後login1；Save後先SQLcleanup與closedconfig部署，再logout/reload/login2，沒有把頁面記憶體session假設成跨reload持續，也沒有隱含第3次登入。完整open/closed候選config、SQL模板/hash、pre/postflight及離線bind工具已備；cutoff仍null/template，綁定前不能dispatch/remoteexecute。actual runtime config兩份仍是原closed SHA `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`；舊frozen包/已部署SQL未動。待新HEAD Reviewer/CI後父一次提交Owner新envelope，本輪不remote/login/livePOST，M3真v2驗收尚未成立。


## 2026-10-04 bounded-v2 驗收收尾與 debt

CoreMilestoneProgress：最近24h已從offline續編推進到一個真signed Owner的v1→v2保存、closed後新登入精確讀回兩版，原v1全row／來源保留；不是以commit/test數代替進度。本次docs只歸檔父與Reviewer證據，不另計一項產品能力。Save `05:06:20.121475Z` → v2 `5802e838-8a06-46c6-934a-0a8c38ba1daa`；`05:19Z`兩版全payload讀回。增量0parent/1version/1audit，排除精確新兩row後24投影count/hash一致；metadata/RLS/ACL不變、46functions僅批准privatebody變動。完整身份、hash、兩次登入與migration時序見[驗收記錄](docs/Bounded_V2_續編驗收_2026-10-04.md)。

| 項目 | 分類／目前狀態 | 再處理條件 |
|---|---|---|
| historical/runtime fixture耦合CI failures | Blocking已解除；`ccfc81b`／`ba430665` test-only RCA/SYSTEMIC_FIX，最終closed CI全通過 | 新harness須沿用explicit synthetic config；不列未解blocker、不另開維護工程 |
| URL專用確切版本Review | 下一個Core；page-only確認／draft保存不等於權威版確認，現行URL card仍待專用審核 | 按新記錄的一條完整offline流程與四項驗收條件實作；不重做bounded Save |
| 100筆SQLite來源快照滿額恢復 | Deferred已知限制；滿額仍拒絕新snapshot，匯出不釋放容量；既有成果保留已驗 | 當後續來源流程需要第101筆且有明確儲存生命週期scope時另處理；不自行刪資料／換架構，本次v2保存未解此限制 |
| unknown跨destroyed tab/context／跨設備，及live故障注入 | Deferred範圍界線；同origin/tab恢復已有offline證據，本輪無live故障注入 | 真實使用需求與新的核定範圍出現才重看，不擴store/retry系統 |

P3/P4不阻塞已驗收子閉環，不搜尋其他edge cases；完整live角色矩陣、真客戶品質、Publish／Measure保留為各自主線驗收，不能由本輪PASS推定完成。


## 2026-10-05 完整RC bootstrap必要P2修正（未再部署）

38bc576首次批准provision已消耗：01:08:39.467Z開始、01:09:01Z phase A exit1；PG UID999無法讀host1000:1000／0600的bind SQL。真Auth、A/B驗收NOT_RUN，WP POST0、無grant；原批准cleanup exit0，01:10:17.722Z核無own root/secrets/container/network殘留，保留消耗標記。詳細時間、ownership及非敏感證據見[RC候選](docs/Internal_RC_Candidate_2026-10-04.md)。

本輪只修同Core blocker：移除SQL bind與副本，由host stdin→postgres UID999 psql單transaction，final PG readiness後執行一次，成功才啟動Auth；secret modes與截止不變。8/8離線契約／短命tmpfs原生PG驗證通過，含實際UID不可讀private檔、stdin成功、rollback與client/server不洩露public sentinel。未重新provision、未新增持久身份／secret／grant。完整RC新增驗收=0，maintenance=0；候選commit/CI/Preview後交既有Reviewer，再由父一次請新執行次數／窗口／artifact批准，不要求Owner登入、不自選下一Core。


## 2026-10-05 原生Auth啟動RCA（第二次已清理，新候選未部署）

c82b88c第二次01:46:03.483Z provision：PG bootstrap PASS，GoTrue migration因postgres預建auth.uid ownership衝突FAIL；A/B驗收、JWT、Save/Review NOT_RUN，WP POST0、無grant。原批准cleanup exit0，01:48:21.978Z核無root/secrets/containers/network殘留，兩消耗標記保留。原始兩JSON及SHA已隨[RC候選RCA](docs/Internal_RC_Candidate_2026-10-04.md)附入repo，便於跨executor核對，未改歷史bytes。

有界RCA後移除Auth shim預建，GoTrue唯一管理Auth schema內tables/functions；角色不升權，business候選SQL不變。新增只讀Auth owner/權限閘門及Data API readiness在WP短grant之前。9/9本機契約與原生PG SQL驗證：70官方migration image/tag bytes一致，以非superuser authadmin全部執行後接exact business SQL，再以authenticator/JSON claims驗Save/Review/fresh SQL readback及tenant拒絕。這不是GoTrue/PostgREST executable/JWT/HTTP runtime驗收，完整持久A/B仍NOT_RUN；候選交既有Reviewer後由父決定新精確批准，不自動重跑。Core完整RC新增驗收=0，maintenance=0；本輪解除直接相容性缺口並補有界整體SQL證據。


## 2026-10-05 短命原生Auth/PostgREST整合（非持久RC）

父針對Reviewer01a109d7必要P2明確授權native日常regression。共用候選PG/Auth/REST env與bootstrap/business SQL，GoTrue executable自行完成70migration、admin建立3syntheticusers、password grant真JWT。HTTP Save/Review200→logout204/舊refresh400→freshlogin200→exact全row讀回；錯簽章401、viewer/foreign寫入403、native刪身份後GETuser403/ownOrg隱藏/寫403，拒絕案business完整snapshot不變，最終1version/1review/2audit。

最終本機run02:25:53.127–02:25:59.872Z PASS，10/10契約PASS；[原始JSON](docs/evidence/Native_HTTP_2026-10-05.json)及[詳述界線](docs/Internal_RC_Candidate_2026-10-04.md)。專用internal network無host ports、PG tmpfs、Auth/REST readonly、無WP、無host secret檔；按owner labels清理後無run容器/network，原root仍不存在、兩marker bytes保持。沒有SQL插身份/寫GoTrue ledger/手設claims冒native證據。JWT/logout/HTTP證據不外推產品emailOTP/browser或全runner退出持久A/B；候選CI/Preview後交既有Reviewer，不自動第三次RC。CoreMilestoneProgress=1 native子閉環、maintenance=0。


## 2026-10-05 第三次RC摘錄核對必要P2（未第四次部署）

fae2fdf第三次唯一provision已消耗並清理：native70migration/3users、UI Save→fresh native session→exact payload/Review成立；首次WP POST200三欄套用，但空raw自動excerpt.rendered改變被untouched比較判state_diverged。1publish/0restore，measurement/第三提交/B/完整tenant未跑。原failure/cleanup JSON按原SHA歸檔[RC候選記錄](docs/Internal_RC_Candidate_2026-10-04.md)，歷史不改成功，control歷史僅setup預期核對及wire body未保存限制明記。

父依Reviewer必要P2授權最小修正：只有raw精確空且unprotected摘要rendered視衍生；完整raw/protected/型別與其他untouched嚴格保持，explicit rendered仍嚴格。發布/恢復皆核API/HTML，unknown不解鎖新提交。短命真WP採原RC theme，空/explicit兩case之lost reply/SIGKILL/new PID原ID GET-only、2POST publish/restore與全control page/meta、HTTP receiver keys證據；1280/390原入口回歸。新candidate增control-before/after及keys記錄，未部署。CoreMilestoneProgress為必要核對缺口修正與可審synthetic證據；完整RC完成=0，maintenance=0。CI/Preview後交既有Reviewer，再由父決定新的完整RC批准；不要求Owner登入、不沿用任何已消耗窗口。


## 2026-10-05 第四輪完整RC已執行並清理（待獨立審查）

Owner新窗口授權固定49db1dc候選，04:38:49Z provision；A 04:39:12Z exit0，舊runner/browser/service退出後B獨立新process於04:39:55Z開始、04:40:00Z exit0。Native JWT Save→新session exact payload/Review、受控WP publish/API+HTML readback/restore、unknown measurement持久保存、新process恢復publication與原pending GET-only、tenant負測零business/journal增量均成立。WP只2 POST（1publish/1restore），第三與B均0；control完整非secretpage＋meta前/A後/B後一致。04:42:10Z cleanup exit0、grant隨DB銷毀、四consumedmarkers保留，未延窗或再provision。

[完整驗收索引與26份原始非secret證據](docs/RC_Attempt4_驗收_2026-10-05.md)；結果待既有Reviewer，非Owner真內容/live公開站或emailOTP驗收，measurement仍unknown無SEO效果主張。CoreMilestoneProgress=完整受控A/B使用者閉環證據，maintenance=0；前三次失敗歷史不改。此PR19收尾僅證據/status；UIUX另branch/PR，不把文檔HEAD視為重新執行RC。


## 2026-10-05 核心UI回饋與project技能（獨立stacked PR）

Owner已選Core：URL→result→edit→save→新session→exact版確認的操作狀態／錯誤／鍵盤手機可讀性。沿現有視覺及HTML/CSS/ES modules補loading+aria-busy、三欄近端錯誤、未保存preview狀態、44px操作和手機換行，無新runtime依賴；Auth/SQL/tenant/發布權限和unknown只核原request不變。完整synthetic1280/390與exactpayload/Review、duplicate/unknown/cancel及tenant拒絕零增量通過；[安裝／實用／改善三層證據與限制](docs/UI_UX_Core_驗證_2026-10-05.md)。

UIUX Pro Max固定來源477bcb28、MIT、74來源檔完整SHA及安全審查，Python本機search及資料validator通過，當前task確實讀取並用於上述修正。僅explicit loading，native skills catalog仍空，不修loader。PR19保持RC證據收尾；此獨立分支更新的build-only RC candidate hash沒有批准窗口，不重跑RC。CoreMilestoneProgress為可見核心回饋及完整synthetic流程驗證，maintenance=0；交既有Reviewer，未自選新Core或宣告live品質／SEO結果。

## 2026-10-05 單站真內容試點第一候選增量（未部署，待審）

最新Owner授權由PR20 fa2e737獨立stacked branch實作server-only單站page/三欄候選，沿用workspace Auth/Review與publisher/journal。短write/read grant與穩定證據身份分離；write到期/憑證撤銷後仍核workspace讀歷史，backup新目錄只讀恢復，不恢復writer。1publish＋1restore attempt，原unknown GET-only；profile明記single_site_wordpress且測試environment=isolated_fixture。UI單獨恢復確認、44px/鍵盤/手機，量測明記未知、不冒真流量。

[26契約及1280/390完整synthetic/實際短命WordPress驗證](docs/Single_Site_Pilot_驗證_2026-10-05.md)與[三頁核稿包](docs/pilot-content/README.md)：URL→edit→Save→全新session/exactpayload/Review→發布lost reply→原operationGET→restorelostreply→write到期只讀核對，歷史v1/備份、tenant零增量及WP控制頁/額外欄位/第三attempt拒絕。每viewport2成功WP POST；全owned container/TLS已清理。無hosted/site/account/grant/GSC/費用或公開內容。

GSC America/Los_Angeles/DST/coverage真資料契約為父允許拆出的後續增量，本PR未實作；crash保留writer lock需離線核對，不宣稱託管災復。此次歷史checkout誤讀已按最新Owner/派工與PR20 authoritative head有界核清，未動PR19 worktree；不另開maintenance。CoreMilestoneProgress=單站候選持久历史/只讀復原及真內容草稿，maintenance=0；提交CI/Preview後交既有Reviewer，不自驗APPROVE。

## 2026-10-05 PR21 必要P2：WordPress參數來源限制

Reviewer指出JSON三欄以外仍可由query更新excerpt；固定8ba1444於新短命原生WP重現HTTP200、attempt0→1、excerpt改動後清理。候選gate改於native route/defaults/sanitize後、controller前，逐來源白名單＋merged exact JSON核對，再扣attempt。29負測均在attempt0被拒、完整target/control page/meta不變，正常JSON publish/restore仍200；1280/390完整fresh session/Review/unknown GET-only/restore/歷史/tenant回歸及19契約PASS。原證據hash與三頁草稿不改，新[重現及修正證據](docs/evidence/Single_Site_Parameters_2026-10-05/SHA256.json)另存，同PR新HEAD CI/Preview後交原Reviewer。CoreMilestoneProgress為必要安全缺口解除，maintenance=0；無hosted或跨run grant，GSC下一Core未啟動。
