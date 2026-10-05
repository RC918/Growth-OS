# 固定既有 v2 的 bounded Review 候選包

2026-10-04；**僅 repo/offline 準備，未批准、未安裝、未寄信、未開窗。cutoff=null。** 基於 `2444bd17000e2512f7674367d163e1dd22ed887a`；Review Core `15a3706` Reviewer `01a10573` APPROVE_WITH_DEFERRED_DEBT，CI 順序修復 Reviewer `01a10575` APPROVE。父提供 Preview `DexsE872VFnbb6zDUY5xDLg3SpRa` success、CI `37180934357` 當時 inprogress；不將其記為 success。

可驗收結果：既有 Owner 核對已保存 v2 的原文／修改／來源／相關必要事實，以唯一 request 確認這個版本；立即撤權、closed 部署，第二次登入精確讀回同一確認及完整 v2/v1。兩版都保持 draft／未發布；不是發布授權或獨立事實驗真。本包仍須 Reviewer 核候選，再由父取得完整新 Owner 批准；舊 06:00 Save envelope 完全不適用。

## 固定範圍與最小預算

所有完整值見 [manifest.json](manifest.json)，其中：

- Project `vhzryhibmpvglzcmfnaa`，actor `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e`，OrgA `93a88055-0a0b-40c0-b22f-a6d312320001`。
- parent `9bafbb2f-eea7-48ea-bc23-3896897f19c3`；唯一可確認 v2 `5802e838-8a06-46c6-934a-0a8c38ba1daa`。v1 `4595e34a-0b2d-4a73-984b-d7439b52325c` 僅歷史讀回。
- 新 Review request `1f3f43cb-a64c-4739-a4a7-772d5b2cb781`；原 Save request `a326f6ce-03c7-4d3e-9fce-c22b2849cb48`。
- source digest `sha256:8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056`；content digest `sha256:581c752caa7050579c8251f1dc042aec3e1b0903c75c152170f96fc5e87d883c`。
- 原 Save/version digest `pg-jsonb-sha256:3bf2931ccc19769162d780220d346be4eb9b494bec3c8da39b50c7ac3ab497f2`；v2 canonical payload SHA `43dae94eec716a9c07ed86c64fe4b5a9ae6d54ba55c9e5da9ac7906f858d1c60`。
- 五項核對固定為 title／meta_description／description／source／blocking_facts_clear=true；UI 必須由 Owner 本次勾選，不由歷史 page receipt 預填。`intent_digest` 是這七個 RPC 參數的 canonical SHA，不能取代 server authority。

| 操作 | 上限／結果 |
|---|---|
| tracked migration | 2：`url_review_bound_open_v2`、`url_review_bound_close_v2`，新 history versions 由正式 tracked runner 產生；預期23→24→25，原23筆逐筆／聚合hash保留 |
| config transitions | 2：明確綁定的 open → 同包 closed；均 Save=false、generic Review=false |
| login requests | 2：open 部署 reload 後 login1；cleanup／closed 部署後 logout/reload/login2；不假設舊 signed session 可跨 reload，不含第三封信／第三登入 |
| Review POST | 最多1次，固定同一 request；unknown、空 GET、已知 UUID 不符都不可重送 |
| 資料預算 | 0 parent、0 version、最多1 review＋1 audit；舊 v1/v2/full payload、所有原資料、ledger、goal history 不變 |
| 其他 | 0 Save、0 live URL、0模型、0 Publish、0新帳號／站點／secret／費用 |

## 檔案與安裝差異

[opening.sql.template](opening.sql.template) 是一個新 tracked migration 的完整 schema/RPC/DCL 候選，從既有23-record closed schema開始，**不重播任何 v1/v2 opening**。沿用 [已審 proposal](../proposal.sql)：只新增 content_reviews 五個 URL metadata 欄位、request 唯一約束、形狀約束與兩個 Review RPC；既有表／RLS／table ACL／legacy guards 不變。private body 另硬綁 actor/org/v2/request/三摘要/五核對、已存完整 payload、原 Save request digest及絕對 cutoff。org/member/parent/version 等待後、replay 前、insert 前及 audit 後再次以 SQL `clock_timestamp()` 核時；過期會回滾。兩個 Review RPC 僅 authenticated 可執行，其他角色/PUBLIC保持撤權。Save兩entry永不授權。

[cleanup.sql](cleanup.sql) 是第二個 tracked migration，只撤兩個 Review entry 的 PUBLIC/anon/authenticated/service_role EXECUTE並核有效ACL，不刪schema、成功 review/audit，也不還原成 generic 可寫 body。cleanup 不受開窗 deadline 阻止；後續 Owner 批准須明確涵蓋必要關閉收尾。

[open](preview-open-config.mjs)／[closed](preview-closed-config.mjs) 是候選模板，並非 served config。兩者 `urlReviewEnabled=false`；只有 `kind=exact_version_review`、完整固定 binding、canonical 非 null cutoff、固定 route／身份／版本的 `urlReviewTrial.enabled=true` 可以送出。closed 將此 flag=false，保留 `urlReviewSchemaEnabled=true` 的固定 request GET，expired後也能唯讀恢復；v1 維持既有唯讀 payload UI。畸形 discriminator 不得退回 generic。SQL 獨立硬綁上述範圍，不能信任 client 自報 authority。

實际兩份 runtime config 仍保持原 closed SHA `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`，既有九檔 v2 freeze 不變。沒有新增 store／framework；使用既有 metadata marker 與同一 UI/API 路徑。

[hashes.json](hashes.json) 覆蓋全部十個候選 artifacts。`candidate.mjs` 只從已驗收 frozen v1/v2及已審 proposal 生成；`bind.mjs` 驗舊hash、嚴格canonical UTC輸入，只寫**新** `/tmp` 目錄且拒絕覆寫。Owner 提供明確時段後才可用 `node supabase/drafts/url_review/bound/bind.mjs OWNER_APPROVED_CANONICAL_UTC NEW_TMP_DIRECTORY` 產生完整 bound artifacts（opening.sql、paired configs、manifest及新hashes）；這個命令本身不授權任何 remote。測試使用2099/2000等純合成日期，均不是 Owner 時段。正式批准前應交付並審查 bound bytes/hash，再執行已批准的路徑；不可只批准 null-cutoff template 便自行填時。

## 批准後的順序與證據要求（本次不執行）

1. Fresh 唯讀核對 project、23 history、精確v1/v2/full payload與Owner、Save有效ACL。執行 [preflight.sql](preflight.sql) 並保存 [preservation.sql](preservation.sql) 原資料/hash/catalog；原23history還須保存原rows/body。任何drift即停，不用reset/補history修復。
2. 使用正式 tracked migration route、審過的 opening 名稱／完整body/hash安裝一次。以 [state.sql](state.sql) 核 history24、兩函式security/search_path/prosrc hash、五columns／兩constraints與 effective ACL；比較 preservation 與受批准DDL差異。確認 Save仍全closed。
3. 複製 exact bound open config 到兩份served檔案、commit/nonforcepush後核部署HEAD/config SHA與scope，reload後才login1。核固定來源/v2與五項事實；UI只送一次固定 request。record dispatch時間、request、若有回傳則保存known review UUID，不記token。
4. 不論 Review 成功、失敗或 unknown，停止POST並立即必要cleanup tracked migration，再核有效ACL全closed、部署exact closed config。confirmed success 應最多1review/1audit；cleanup不依賴收到成功回應。
5. 真 logout/reload/login2，展開v2，以原 request＋known UUID（若已有）核對server review，確認完整v2/v1 payload、未發布且無Save/Review可寫；不隱含第三login。執行 [postflight.sql](postflight.sql) 成功斷言及 preservation前後比對。原23history不变，仅新增兩筆新migration；不能用部署ready代替產品驗收。

## 未知結果恢復

- Review timeout/lost response一律UNCERTAIN_RESULT；same-origin/tab marker在dispatch前可靠寫入request/actor/org/version/digests，跨reload/login不清除。既有 [readback.sql](readback.sql)／UI只GET固定request；known UUID必須一致。空GET不是未套用證明，不能清marker、新request、重送POST或更換session追寫。cleanup/closed後仍GET-only；無法確認就保留未知，不宣稱成功。新session讀回的精確review UUID還須與先前外部證據比對。
- DDL/DCL未知先核 [state.sql](state.sql)：實際history version/name/statements、catalog/body hash、ACL；另比對preservation。history/body/schema/ACL全部符合expected-after才記CONFIRMED_APPLIED，不重做；完整expected-before才可記CONFIRMED_NOT_APPLIED。部分／不符為STATE_DIVERGED，停止產品mutation並保存精確差異；證據不足保持UNCERTAIN_RESULT。不要因工具錯誤就再次apply migration，不換name/hash/route、不補history、不自行擴兩次migration預算。只有另有明確批准且能證明同operation安全冪等／期限有效時，才依既有 recovery治理處理重試；本包不預留blind retry。
- cleanup若已closed即完成撤權，不因transport未知重開。開啟已確認、Review未知時仍須依新批准的必要收尾權限關閉；若opening未套用則不對不存在函式盲跑cleanup。未知/失敗分支不跑「成功一筆」postflight冒充PASS；保留0或1的觀察及原資料/hash、讀回結果、剩餘不確定。

## 離線證據與剩餘限制

- `node --test supabase/drafts/url_review/bound/candidate.test.mjs`：5子檢查PASS（runner6）；可重現hash、null cutoff拒絕、binder無覆寫、23-history/ACL/base drift、固定scope、audit後expiry原子回滾、one review/audit、cleanup與原rows/catalog/history不變、bound prosrc hash。
- `node --test prototype/owner-workspace/url-review-bound.test.mjs`：4 PASS，含 strict discriminator、身份/route/version/digests、固定request、closed/expired新session GET與preflight途中到期。
- `node supabase/drafts/url_review/bound/native.mjs`：5 PASS，獨立 PG17 backends 的 org/member/parent lock wait跨deadline拒絕、並發fixed request唯一效果、expiry/revoke拒絕與v1/v2全row保留。既有 pinned image、`--pull=never --network none`，沒有下載／host port。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/url-review-bound.e2e.mjs`：1280/390各11情境PASS；實際candidate configs→同UI/API→固定intent→single synthetic POST→SQL cleanup→closed reload/login2→exact review/v2/v1。含unknown committed/empty、knownUUID mismatch、closed/unbound、identity/version/digest/request/expiry拒絕；每案兩OTP，0或1Review，0Save，無overflow，原rows/catalog/history不變。
- 受影響 workspace/API 與一般Review回歸PASS；generic Review success/unknown/closed桌機手機回歸PASS。CI顯式注入test config，新native step排在既有 `native_ledger.py` pinned image初始化之後；沒有改exit2為skip/PASS。

以上本機Chromium151／合成Auth／隔離SQL，**不是 live Review或新HEAD CI驗收**。P3共用marker「續編／保存」文案debt沿用延期。下一必要Core：Reviewer核完整候選／新Owner時段與批准／bound artifact最終核對後，才可開始一次上述live驗收；無新批准前保持closed，不開始Publish/Measure。
