# 已保存成果續編與取消恢復｜離線驗收

現行更新（2026-10-04）：[bounded-v2 真續編驗收](Bounded_V2_續編驗收_2026-10-04.md)已最終APPROVE，取代下文歷史「v2 live未驗收／待授權」狀態；unknown僅既有offline範圍，本輪沒有live故障注入。遠端envelope已收尾、Save/ACL closed，下一Core為確切版本URL專用Review；下文保留各offline切片當時證據。

沿用 v2 M3 及父接受的 `7563bd2e80fdfb98a15fc16d866f0d93237ce3d3`，本切片把「只能唯讀展開已存 URL 成果」接到「Owner 從最新已存 draft 續編，在本頁重新確認或取消返回」。基準 bounded fixed case 的 [live 證據與授權收尾](Bounded_M3_Fixed_Case_驗收_2026-10-03.md)不重做、不擴大；本切片尚待新 HEAD CI／Reviewer 接受。

## 行為與限制

- workspace 只在 Owner 的最新 URL draft 詳情提供「續編此已保存版本（未保存）」。viewer／editor／legacy／非 draft 不出現入口。
- `readReviewBase` 使用既有 authenticated client 與精確版本讀取，GET 當前 org 的 URL parent、最新版本 scalar metadata、完整指定 UUID payload；逐項匹配列表版本並驗證 payload。進入與本頁確認前均重新核對，任何已觀察的版本、來源／內容、tenant、session 不符即拒絕。這是唯讀觀察，不宣稱鎖住其他 session 的未來變更。
- `restoreResultReview` 沿用原 Review engine，先驗完整 export，恢復已存三欄值與 `review.original_suggestions`，保留 snapshot／facts／citations。不使用 `createResultReview(exported)` 把已存修改重標原建議。舊 receipt／fact checks 清除，revision 從已存修訂往後；原 payload 不變。
- 本頁确认只對應目前續編內容及核對過的 base version；UI 保留該 UUID／版號並明示未保存、未發布。修改再次撤銷確認；不形成 owner publication approval。
- 取消丟棄本次未保存修改、回到原已存唯讀成果；重新續編仍從已存值開始。重新整理／離開不持久化本頁修改。登出／刷新／關閉詳情／版本或 session 改變後的晚回覆不能恢復舊 editor 或成功訊息。
- 沒有新 store／schema／ACL／RPC、外部發布或遠端操作。Save 仍 closed，未實作新版本持久化；這不是完整 M3。

## 本地證據

- `node --test prototype/owner-workspace/saved-result-review.test.mjs prototype/owner-workspace/workspace-api.test.mjs prototype/owner-workspace/url-result-api.test.mjs prototype/owner-workspace/url-result-bound.test.mjs prototype/public-audit/first-result-review.test.mjs`：32 tests PASS。包含原建議與 source 保留、取消恢復已存值、舊 receipt／late digest 失效、最新版本與 payload 驗證、viewer／editor／tenant／replacement session 拒絕、mirror。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/saved-result-review.e2e.mjs`：1280/390px PASS。實際 workspace DOM＋synthetic transport，驗讀回→續編→重新確認→再改即失效→取消、版本漂移、同 UUID 來源資料改變、錯 tenant、viewer、取消／logout 後 late response，payload 不變、零 POST。
- 同一 Chromium 151 環境下，`typed-draft-ui.e2e.mjs` 及 `url-result-ui.e2e.mjs` 的 1280/390px 既有回歸 PASS；後者的保存僅 synthetic transport＋isolated SQL，不是 live POST。
- 新 unit／E2E 已接既有 `.github/workflows/python-tests.yml`。logs：`/tmp/resume-all-unit.log`、`/tmp/resume-ui.log`、`/tmp/resume-typed.log`、`/tmp/resume-url.log`。

兩份 runtime config 保留 reviewed closed SHA256 `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`。SQL、frozen payload 與已驗遠端 1 parent／1 version／1 audit 未改；沒有新 login、Save、reopen 或 lease 延展。僅交付這個 offline Core，後續分配由父確認。


## 後續：確認續編 → 新版本保存意圖（尚未送出）

上一切片 `2db5c0b0395b988abd0f3e65d51d8e3e25e993f0` 已由父提供 Reviewer `01a10352` APPROVE、CI `37149280839` success、Preview `6LAs5AnjEuyGxqqWfNbNoKMDiUpc` success。本段為其後獲分配的新 offline Core，取代開頭對上一切片「待審」的歷史狀態；本段的新 HEAD 仍待獨立 CI／Reviewer。

- 同一續編 editor 在本頁確認後提供「準備新版本保存意圖（不送出）」。展示預計版本及可展開的完整意圖，全部文字明示未送出／未保存／未發布。沒有連到 Save handler。
- `prepareUrlRevisionIntent` 重新核對同一 signed Auth user、恰好一筆 Owner membership、org、URL parent、最新 scalar metadata、指定 base UUID 的完整 payload。意圖使用現有 URL Save 的 `organization_id/opportunity_id/request_id/expected_version/payload`；expected version 是已存基準版本，每次準備操作產生新 UUID request，已備妥時不重複產生；失效操作不回傳候選。
- 附加 binding 是重新核對的 actor、base version UUID 與原 DB request digest。`intent_digest` 是此 binding＋request 的本地 canonical SHA256，不冒充 server 的 `pg-jsonb-sha256` request digest；DB fingerprint 仍由既有 SQL 計算。
- 只容許三欄續編值／修改歸因與新 revision、核對／confirmation 更新。來源 snapshot、facts、citations、原建議等其他欄位須與 base 完全一致；舊 confirmation、未修改內容、malformed 或已變更 base 都拒絕。回傳 deep-frozen candidate，不修改 base。
- 修改／核對改變清除舊意圖，取消丟棄意圖；取消、logout、替換 session、晚回覆及 async 修改不能發布舊候選。重複按鈕在處理中或已備妥時停用。既有 Save 關閉仍拒絕直接提交其 request；意圖各 authority 旗標 false。

驗證：27 API／marker／mirror tests PASS（含錯 actor/org/UUID/version/source、malformed、cancel/logout/replacement-session late result、closed Save 拒絕）；`saved-result-review.e2e.mjs` 1280/390px 真 DOM 組裝續編→確認→新版本 intent／修改清除／取消與 late intent，synthetic transport 零 POST。logs `/tmp/revision-intent-api.log`、`/tmp/revision-intent-ui.log`。

既有 `supabase/drafts/url_result/offline.test.mjs` 的 isolated PGlite 10 tests PASS；新增測試把組裝 API 產生的 request 明確交給既有 SQL 函式，證明 v2 append／同 request 冪等、v1 不變、stale expected version 拒絕及 1/2/2 預算；沒有新增或修改 SQL 檔、函式、bound artifact。API 轉接層使用 HTTP 等價 JSON roundtrip，與原生 DB Date 物件區分；log `/tmp/revision-intent-sql.log`。所有 grants／測試寫入僅在既有 disposable DB 測試範圍，未操作遠端。

本次仍保持兩份 closed config 原 bytes，以及全部部署 SQL／frozen payload／遠端 fixed-case 1/1/1。持久化新版本的 runtime dispatch、live acceptance 均未開放；不宣稱永久跨 session 鎖定或完整 M3 完成。


## 後續：同一續編 UI → Save → 精確 v2 讀回（完整 offline slice）

前一 intent 切片 `101185d229f75c0370d6781e9fc248a5f49f437a` 已由父提供 Reviewer `01a10360` APPROVE、CI `37150266068` success、Preview `C3fbf5TPnERXbcEeQYXxTkzxTJ6o` success。本段是其後獲分配的離線組裝，新 HEAD 仍待獨立核對。

`saveUrlRevision` 重新 GET base，沿用 `prepareUrlRevisionIntent` 的身份／完整內容核對並保留同一 request UUID，對比整個意圖後才交既有 `saveUrlResult`。沒有第二個 RPC 或新 store；原 Save flag／bound gate／session／同步 dispatch guard 都保留。真 config false 時 UI 停用且 API 拒絕；完整 E2E 只在攔截的 loopback synthetic config 開 gate，不修改 repo config。

同一 editor 增加明確保存與「只查詢這次保存結果」按鈕，成功才在旁邊渲染精確 v2；原 v1 唯讀內容不變。延用 `reconcileUrlResult`，新增可選的預期 creator 核對，其他首次 Save caller 原契約不變；續編要求 exact acknowledged UUID（若已知）、org／creator／request／expected version／typed metadata／draft status／完整 payload 一致。

- 保存前基準不符：撤銷意圖／确认，保留使用者修改但停用保存，不自動 rebase。
- 已 dispatch 的 HTTP failure／unknown／衝突：保留原 request、已知 UUID 與修改；保存永久停用於該操作，只可 GET 核對。空 GET 不等於未套用，也不恢復 POST。
- 取消已 dispatch 操作：僅停止 UI 等待，保留原 request 供查詢，不宣稱 rollback；晚 ack UUID 可保留供核對，但不自動顯示取消操作成功。
- logout／session／scope 或晚回覆：不更新舊 editor；錯 UUID／creator／內容不當成功。無 retry、背景重送或新 request 替換。

此 slice 的未決操作控制屬目前分頁／editor 生命周期，未新增跨 reload／跨 session 的持久 outbox 或恢復保證；runtime 仍 closed，不能據此直接放行新的 live trial。這一限制與既有固定 first-save marker 的範圍不同，沒有改動該 marker 或 frozen trial。

驗證：28 API／marker／mirror tests PASS，含 closed dispatch 拒絕、篡改 actor/base/request/digest、取消／logout 的 dispatch 前拒絕，及錯 creator／UUID／org／status／payload 讀回拒絕。新增 `saved-result-save.e2e.mjs` 已接 CI，1280/390px 各六案（success、unknown→空 GET→精確 GET、SQL conflict、cancel、logout、wrong UUID readback）通過；每案一個 synthetic POST，disposable SQL 1 parent／2 versions／2 audits、v1 全 row 未變，成功案 v2 payload 等於意圖。使用既有 SQL，沒有新 SQL／DDL／ACL artifact。

既有 `saved-result-review.e2e.mjs`、`url-result-ui.e2e.mjs` 桌面／手機與 `url-result-races.e2e.mjs` 12 案回歸通過。logs：`/tmp/revision-save-api.log`、`/tmp/revision-save-ui.log`、`/tmp/revision-save-review-regression.log`、`/tmp/revision-save-url-regression.log`、`/tmp/revision-save-races.log`。當前 config SHA 仍為前述 `c37e2d…` closed 原 bytes；live 1/1/1、SQL／frozen artifact 完全不動，無新 remote/login/live POST。


## 後續：保存 v2 → 結束 session → 新 session 精確恢復 → v1 歷史

父確認 `e7209e7ee1e77bf6c73a594cad4296f29ca35623` 已由 Reviewer `01a10370` APPROVE、CI `37151322250` success、Preview `HHaXKYiwoVZ7Eqjiybyns2reWzDg` success。本輪先檢查 `workspace.mjs` 的 dashboard／URL 版本降序清單／按 UUID lazy read，以及既有 logout／epoch 防護；目標流程已有實作，新增完整整合證據即可，沒有改產品檔或再造 editor／store／意圖層。

同一 `saved-result-save.e2e.mjs` 新增 `session_restore` 案例，保留同一 disposable DB，完成一條使用者流程：

1. 原合成 Owner session 從 v1 續編、確認、準備意圖、唯一一次合成 POST 保存 v2 並精確讀回。
2. 明確結束 session 並關閉舊 browser context；新 context／新合成 token 登入，沒有繼承意圖或成功 panel。透過既有 dashboard／Data API，確認清單順序 v2→v1，展開精確 v2 UUID 並比對完整 payload，再展開 v1 比對完整舊 payload。僅最新 v2 提供 Owner 續編，歷史 v1 不提供覆寫入口。
3. 暫停 v2 detail 回應後登出，釋放晚回應，舊 DOM 不再出現資料。新 viewer session 可讀完整兩版但無續編入口；將 detail 回應版本改成不符列表的值時 fail closed。
4. 新 foreign tenant session 的 dashboard 不顯示該既有 parent；同一 isolated PostgreSQL RLS 身份下，既有 v2 UUID SELECT 也回 0 rows。最後核 v1 全 row 不變、兩版／兩 audit 保留，所有新 session 無追加 POST。

執行：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/saved-result-save.e2e.mjs session_restore`，1280/390px PASS；log `/tmp/revision-session-ui.log`。新增情境已由既有 CI 的預設全案例命令納入；測試選擇參數只接受明確列出的案例。因本輪調整共用合成身份／transport 以支援新 session，亦跑一次預設全案例回歸（14 案，log `/tmp/revision-session-full-ui.log`），不重演任何 live fixed case。

以上是 synthetic Auth／transport＋實際 disposable SQL 的新 session 整合，不是新遠端登入／live rollout。runtime config、產品 JS/HTML、SQL、frozen artifact 均不修改，live 1/1/1 不觸碰。

## M3 使用者流程收斂與剩餘項

依 v2 第 6／8 節（成果微調、版本確認、必要登入保存、重新登入恢復，含 owner/viewer／tenant／漂移／舊核准失效／重複與取消），以使用者可完成的流程作單位，不再把已通過的成功路徑拆為新 micro-slice：

| 使用者流程 | 目前證據 | 明確尚未完成／完成門檻 |
|---|---|---|
| 首次成果核對後保存，離開再登入讀回 | 固定 Owner／固定 synthetic 內容的 bounded live v1、1/1/1、tenant negative GET、cleanup 已 APPROVE；一般 Review／交接／SQL 有離線證據 | 尚未代表一般產品／全部角色 live rollout；不重做該已 PASS 固定案例。 |
| 從已保存版微調、確認、保存新版本，重新登入查看最新與歷史 | v1→v2→新 session→完整 v2／v1，以及 owner/viewer／外租戶／版本与晚回應拒絕已 offline 組裝 PASS；來源與原建議保留、舊確認失效、取消／衝突保留資料已有相關證據 | 實際 v2 runtime Save 仍 closed；真 signed v2 保存／跨 session／viewer 整合未 live 驗收。之後須先具備安全恢復，再由父另行核遠端權限／試點範圍；舊 envelope 不可復用。 |
| 保存回應未知時，離開後回來辨識結果並安全繼續 | 同一 editor 內僅原 request GET、不盲目 POST、已知 UUID 精確核對已 PASS | 本輪已完成同 origin/tab 的跨 editor/reload／logout/login metadata 恢復離線流程（見下節），已提交可精確讀回、空 GET 保持 unknown且不重送。destroyed tab/context／跨設備及人為清空 storage 不支持；新 v2 live 放行仍未授權／驗收。 |

下一個最小 Core 提案：一次交付「保存回應未知 → 離頁／新 session → 原 request 唯讀核對 → 已保存成果恢復或明確仍未知」完整 offline 流程；只延伸既有 request／marker／登入契約，範圍限定既有 Owner 與一筆未決保存，避免新通用 store、背景 retry 系統或更多意圖層。保留錯身份、取消及 stale callback 拒絕，1280/390 同流程驗收後即收尾，不把各個查詢／畫面再拆成無限小里程碑。**本輪僅提出，待父分配；未開始實作或授權遠端操作。**

來源／版本漂移、舊確認失效是上述流程的必要防護，不另立無限補強專案；P3 美化／通用治理不追。M3 全產品、完整 live 角色矩陣仍未完成；M4 Publish／M5 Measure 仍是未完成的後續里程碑，不能由這些離線 PASS 推定完成。


## 同 origin/tab 的 unknown 恢復：本輪限定流程已組裝

父確認前一證據切片 `ea87cc0acaa45a9120f5fde9c0aedcec68c2c402`：Reviewer `01a1037d` APPROVE、CI `37152160413` success、Preview `48jS9KPVHYhA4ZdMJ9wqWngcAQNm` success。本輪依核定範圍一次完成上節的下一 Core；上文「僅提出／未實作」及只限 editor 生命周期的段落是歷史状态，由本節更新。新 HEAD CI／Reviewer 尚待父核對。

### 同一 marker 後端與單筆 metadata

在既有 `url-result-trial-marker.mjs` 追加 `createRevisionMarker`，使用同一原生 sessionStorage 後端的 `growth-os:url-revision-attempt:v1` key；原 `createTrialMarker` 實作前綴原 bytes、既有 key 及所有 frozen bound artifacts 不動。只有一筆未決 revision，不新增 DB/store/outbox／通用 retry 框架。

marker 僅含 actor/org/parent/base UUID、原 base request digest、base payload digest、原 request UUID、expected version、source/content/payload/intent digests、known UUID、resolved。沒有 token、payload、來源 bytes、修改文案。API 在 dispatch 前同步 setItem→getItem exact bytes 核對；storage 拒絕、no-op 寫入、損壞、已初始化後消失／外部變更皆 fail closed。不因空 GET、logout 或 reload 清除／換 request，未決時共用 URL append API 亦拒絕重送。

### 使用者可完成的恢復流程

- 原 editor 保留修改與一次 dispatch 的 request；取消只停止等待。關閉／重開 editor 時發現 pending 不再建立新的意圖，workspace 的恢復面板只提供查詢。
- 同 origin/tab reload 後，沿用既有登入流程；新 session 先核 Auth user／單一 Owner membership，再讀 exact base 與原 request，全部 GET。錯 actor/org/base/version/source/digest、malformed、known UUID 不符不接受，empty GET 明示仍 unknown。
- 精確讀回時同時驗 base payload digest、v2 creator/org/parent/request/expected version/draft status、完整 payload digest、來源與 content digest，以及重算本地 intent digest。只有全部吻合才顯示恢復成果並標 resolved；保存結果可能晚到，known UUID 單調保留，舊 ack 不得污染下一個操作。
- session／頁面生命週期 guard 拒絕舊回覆；storage 損壞不自動重設或改用另一 request。成功核對後可在原 metadata 槽處理下一筆，未決時不覆蓋。

**範圍邊界**：同 origin、同一仍存在的 tab，涵蓋跨 editor／reload／logout/login；不支持 destroyed tab/context、跨設備或使用者手動清除 sessionStorage 後的防重送恢復。未提交的修改只在原 editor 記憶體中保留；storage 不存 payload，故 reload 後若資料庫仍空，無法從摘要恢復文案，UI 明示 unknown 而不假造恢復。已提交的修改則從精確 DB 版本完整讀回。沒有把未支持範圍列 PASS 或擴張成新的維護工程。

### 證據與收尾

- 32 API／marker／mirror tests PASS：`saved-result-review.test.mjs`、新增 `revision-marker.test.mjs`、既有 workspace／URL／bound API tests。覆盖各識別／摘要不符、storage 拒絕/no-op/corrupt/disappear、known UUID 單調性、empty GET 不解鎖共用 Save，以及 stale session；log `/tmp/unknown-recovery-api.log`。
- 同一 `saved-result-save.e2e.mjs`，1280/390px 共 28 案 PASS；本輪新增 14 案涵蓋 committed unknown、uncommitted empty GET、known UUID 拒絕／恢复、pending 損壞 reload、storage denied/corrupt/no-op。驗 dispatch 前 metadata 已可靠存在、same-tab 跨 editor/reload/logout/login、新 actor 拒絕、原 request 不變、恢復零追加 POST、v1 全 row 不變；logs `/tmp/unknown-recovery-ui.log`、最終 `/tmp/unknown-recovery-full-ui.log`。使用既有 disposable SQL，不修改 SQL。
- 既有續編／意圖 UI 1280/390、URL Save UI 1280/390 回歸 PASS；logs `/tmp/unknown-recovery-review-regression.log`、`/tmp/unknown-recovery-url-regression.log`。新增 unit 已接既有 CI。
- 第一次合成恢復 login 只改同 URL hash，未觸發 document load，workspace 保持隱藏；實際錯誤提示仍為登入初始文字，無 API/page errors。測試改為同 tab 導頁（不銷毀 context，sessionStorage 保留）後通過；沒有更改產品 Auth 或放寬驗收。

本輪限定 offline 恢復已完成，不再拆 marker／GET／畫面小任務。真 Save 仍 closed（两份 config exact SHA `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`）、live SQL／frozen artifacts／既有 live 1/1/1 不變；沒有 remote/login/live POST／費用。後續產品放行仍需父核新 v2 live 試點權限與驗收範圍，不能沿用已收尾 envelope，也不宣稱完整 M3／Publish／Measure 完成。
