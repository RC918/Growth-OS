# 已保存成果續編與取消恢復｜離線驗收

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
