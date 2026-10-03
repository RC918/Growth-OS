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
