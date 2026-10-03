# Typed draft workspace 唯讀相容性｜2026-10-03

基準 `16ef57627fbe1409e675d60b33559990de34ffcb` 已由父獨立接受：push CI 37089011426／PR CI 37089015968 success，實際 PG17.6 trim 等義控制、51 URL、舊鎖 legacy create/review deadlock 對照及修正後 overlap、三種 membership revoke 時序、1280/390 各 22 次下載。這是父轉交證據，本切片未重新執行 SQL／URL suite，也未連遠端核對。

## 改動

直接更新現有 workspace 機會卡片的目前／歷史版本；apps/web 與 prototype/owner-workspace 保持一致。任何非 NULL 的 first_result 四欄標記都歸為 typed，包括只有 request metadata、payload 缺損的回應；舊 schema 未傳欄位與四欄全 NULL 保留 legacy 呈現。

Typed 三欄全文唯讀；可用鍵盤展開原文／原建議／修改與引用、facts／inferences／未知／pending confirmation、來源識別／來源 bytes 摘要、內容 revision／內容摘要、完整快照與原始 bytes、歷史 page-only receipt 及完整 payload／請求識別。不 trim、不裁切長 Unicode，不解析來源 HTML 或建立外部資源連結。摘要與 payload 只供查核，沒有在 UI 重算或宣稱驗證通過。基本欄位缺漏、來源版本綁定或既有兩欄投影不一致時警示；不是另一套完整 SQL validator。

Typed 一律「待專用審核／未發布」；page-only receipt 不是 owner approval。即使回應混入同版 approved review／action plan，也不呈現可執行狀態，不開放 generic review、舊兩欄修訂或執行方案。歷史 typed 不承接 legacy 核准，最新 legacy 仍保留既有操作。

版本卡片操作綁定目前 render generation、頁面 epoch、state 與 connected DOM；同卡片一次只送一個 legacy mutation。刷新開始、版本／來源改變、登出或 pagehide 後舊事件失效，舊 dashboard 回覆不能覆蓋新回覆；pageshow persisted 先刷新再開放新卡片。已送出的 legacy 請求不能撤回，但其晚回覆不能寫入新 typed 卡片的成功狀態，也不自動重試。刷新失敗提示重新整理，失效卡片不再允許內容操作。

## 本地驗收

- `node --test prototype/owner-workspace/workspace-api.test.mjs`：10 tests PASS，包含 Auth/API 合成契約、角色／scope、原 mutation 參數及發布檔鏡像一致性。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/typed-draft-ui.e2e.mjs`：1280／390px PASS。每個 viewport 使用真實 workspace.html／renderer、合成 Auth/Data API transport；所有非本地請求均攔截，未知請求拒絕且令驗收失敗。
- E2E 包含 owner/viewer、typed 最新及歷史兩種混合順序、偽造 review/plan、缺 payload/meta/facts/review、投影／來源綁定不符、HTML 安全、2000 UTF-16 title 與超過 2000 的原建議、完整 JSON 逐值比對、鍵盤詳情與無水平溢出。
- 包含展開／關閉返回、保留舊 DOM handler 後切換版本／來源、legacy 未保存修訂阻擋、重複事件、晚 mutation 回覆、dashboard 逆序回覆、模擬 pagehide/pageshow persisted 與重新登入。這些生命週期事件驗證不是瀏覽器真實 bfcache 命中率證據。
- 每 viewport 恰好三個合成 legacy mutation：review、create、plan 各一次；typed mutation 為零。無真 Auth／RPC／遠端 DB／產品抓取。
- CI 新增此專項步驟（3 分鐘上限），沿用固定 Playwright。新 commit 的 CI／Preview 仍待父獨立核對；本地 Chromium 151，不冒充 CI Chromium 145 的結果。

## 邊界與後續

**遠端 SELECT 完全不改。** 現行 SELECT 沒有 typed 辨識與 payload；測試刻意提供超出 SELECT 的合成 typed 欄位，以驗證實際 renderer，而不是宣稱遠端已能恢復 typed 草稿。沒有 production fixture 開關、新 demo、store、adapter、Save、RPC 或 Auth 接線；未要求未部署欄位，也未擴大成 500 份 payload 查詢。

在真實 schema／read contract 尚未接線前，缺少所有辨識欄位的 typed row 無法由 UI 與 legacy 區分；此切片不解決這個傳輸缺口。未來須在明確遠端批准下處理 schema 相容、精簡版本清單辨識、按需精確 org＋version 讀回、真 JWT/RLS 與完整保存／恢復驗收。此切片完成時 SQL 尚未部署；後續停寫部署結果見文末，UI 保護始終不代替服務端權限。

URL → First Useful Result → Review → Publish → Measure 不變；不新增 Profile onboarding 門檻，不放行完整 M3 或發布／量測。

## 父審查 P2：新增版本成功訊息歸屬

`1964f6ef10da448e8fd8147e6a4a7a96c5313bd2` 的 push 37089871698／PR 37089874941 success，父已讀得 10 API／mirror、typed E2E 1280/390 及既有回歸 PASS，Preview `4sg87bsJs2ZW7EbMJeg7pBxSw8TQ` Ready；但獨立 review HOLD 新 guard 的版本歸屬問題。CI 綠燈不覆蓋此缺口，不稱服務端錯寫。

原 `mutateLegacy` 忽略 create RPC 回傳的新增 version UUID，`createsVersion=true` 直接允许將成功訊息放入目前卡片。原 fixture 回傳 `synthetic-result`，dashboard 仍為 v1 卻期待新建成功 badge；此錯誤驗收已取代。

先只修改合成 E2E，再執行舊 renderer：每個 viewport 的正常 v1→v2、較新 render 後晚回覆 PASS，但「RPC 回 v2，dashboard 最新為 v3」和「RPC 回 v2，dashboard 仍只含 v1」均 FAIL（實際 badge 1、應為 0），合計四個失敗，exit 1。證據 `/tmp/typed-uuid-before.log`；不是遠端資料寫錯證據。

修正僅捕捉 RPC 結果：create 的成功訊息須綁回傳 version UUID；review/plan 的結果是各自紀錄 UUID，仍綁其原本操作的 version。刷新後最新 row 與確切目標一致且為 legacy 才顯示 badge；DOM panel 也核對相同 version id。新版已改變或該版本尚未讀回時，只顯示「已收到操作回覆；目前草稿與本次操作版本不同或尚未讀回」，不把 v2 的完成貼到 v1/v3。原 epoch／generation／connected guard 保留，較新 render 後的晚回覆不刷新或改動新畫面。

同步加強 fixture：version／parent／request／RPC 結果使用 UUID 格式；正常新增讀回 v2 的文字與提交值相同。每次 pageshow fixture 以唯一合成 organization response 標記等待自己的整次 render 完成；相同 version id、既存 typed-incomplete 不再作刷新完成依據。每種缺損 payload 另逐值核對所呈現的實際 payload。這是測試同步修正，不宣稱另外發現 typed mutation 漏洞。

修正後本地 1280／390px E2E 全部 PASS，包括每 viewport 四個 UUID 歸屬案例；每 viewport 現為六個合成 legacy mutation（review 1、create 4、plan 1），typed 仍為零，取代前段三次 mutation 的舊計數。正常成功 badge 僅出現在回傳 v2；v3／缺 v2 中性提示、晚回覆無 badge。完整既有 typed 驗收保留，API／mirror 10 tests PASS；證據 `/tmp/typed-uuid-after.log`。新 SHA 的 CI／Preview 仍待父獨立驗收。

遠端 SELECT／API／Auth／RPC 與 CSS 未改，無遠端 DB／登入／產品請求。仍僅合成 renderer 相容性，不放行真保存或恢復。


## 後續停寫 schema 部署（不等於真讀回）

父提供 2026-10-03 04:10 UTC 的獨立 postflight：Owner 04:01:01 單次批准後，父以 a150beb 的精確 closed SQL 部署 `20261003040602 first_result_closed_package`；總 migration 18→19，原 goal history 仍為 13 筆。15 新函式、四欄／約束／typed review guard 正確，新保存入口及 helpers 的 client EXECUTE 均關閉，typed rows／first-result audit／測試 request IDs 持久 0；業務／ledger 前後不變。完整授權、52,447-byte statement hash 及獨立快照／包內 assertions 的證據區分見 [停寫部署紀錄](../supabase/drafts/first_result_save/CLOSED_PACKAGE.md)。

既有 dashboard 的 SELECT 仍沒有 typed 辨識欄位／按需 payload，因此 renderer 的合成驗收不能當成真 Data API 或跨 session 恢復通過。部署批准僅一次且已用完；未批准開 grant、登入或真 Save。本次只補文件，不重新測試、不連遠端、不實作下一讀取切片。
