# 已保存確切版本的複製／下載｜2026-10-04

使用者在新 session 恢復已保存 URL 成果後，可直接複製三欄成果或下載包含完整來源的 JSON。位置：`workspace.html` → URL 成果 → 展開選定版本 →「交付此已保存版本／歷史版本」。不依賴真人 checkbox，不做任何 remote mutation。

基準 `64962927e0b61494c48c6bfbff953cdfe6616888`；父確認 Reviewer `01a10789` APPROVE、CI `37212568096`／Preview `6c8QfFk33bBQSFuLVoKeabmZ4iAC` success。原 first-result Copy／Export 只處理本頁未保存成果，typed-draft／workspace 無已保存交付出口，故本次補既有版本旁兩按鈕，不另造交付框架。

## 行為與安全界線

- 每次輸出沿既有 authenticated API 重核 user、同 org membership／role、URL parent、精確版本 metadata、完整 payload 與來源；沿用 `readContentVersion`／`validateReport`。再次讀回拒絕操作中資料漂移；最後核對最新／歷史身份，最新已被新版替換則要求重新選取。
- 所有有合法讀取權的既有角色可交付自己可讀版本，沒有新增寫權。viewer／editor 沿相同權威 GET、foreign／membership 撤除／身份切換拒絕；不把 UI role 當 server 授權。
- clipboard 為三欄精確文本，附 org／version／候選 URL／來源、內容、payload 摘要及限制。JSON `growth-os.saved-url-result.v1` 包裹完整原 payload、三欄、org／parent／version／request／source 與摘要；filename 使用已驗 UUID，不使用來源文本。原 page-only receipt 保留在 payload，不升格為 Owner 核准；匯出本身不證明版本 Review。這個包裝不是原未保存成果匯入格式，未宣稱可直接重匯入。
- 明示「讀取時最新」或「歷史」，候選 URL 不證明站點所有權、來源快照未獨立驗真，`published=false`、`publication_authorized=false`、`review_attested_by_export=false`。複製／匯出不是發布或確認。
- 未保存 editor 不是輸入。開始續編即停用兩按鈕／清除備援文本；取消後須重新 GET。面板關閉、版本／session 替換、晚 GET／驗證回應不會觸發 clipboard／download，失敗不提供舊內容；同一面板序列化輸出。交给瀏覽器的 clipboard／download 已發起後不能追溯撤回，晚完成不再顯示於失效 session。
- 只在 clipboard 拒絕時建立 readonly 手動複製欄位，內容以 value/textContent 放入；開始下一操作／續編清除。首次 E2E 發現預先隱藏 textarea 影響既有續編選取，改為按需建立後通過，未削弱既有測試。

## 驗證

新四組契約／DOM tests：最新及歷史的精確三欄／payload／source／限制與合法角色；錯 org／version／digest／payload／latest 分類、缺 current callback、資格撤除拒絕；讀取中取消／登出／替換 session／role／內容漂移拒絕；晚結果不得觸發 copy/download、clipboard 拒絕備援及安全文本／續編清除。workspace mirror 與發布前檢視回歸保留，新 tests 併既有 CI。

沿用既有 `url-review.e2e.mjs` 的真 UI／API＋synthetic transport＋isolated SQL，未新增 harness。1280／390 各測 4 次真 clipboard 讀回與 4 份真下載檔案 bytes：新 context/token 讀回的最新 v2、Owner 歷史 v1、viewer 歷史 v2，以及 Review schema 開／write 關且未確認的 v2。逐一比對檔名、org/version/classification、候選 URL／source、三欄、完整 payload、SHA256 及未發布／不授權旗標。每次交付 POST 數不增，既有 review/audit/version 數與原資料保留斷言仍成立；foreign 不見該成果，續編時兩按鈕停用，無 overflow/page errors。

actual 兩 config SHA256 仍 `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`；persistent frozen index 仍 `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351`。SQL／Auth／frozen 未改，無 hosted／登入／restore／Save／Review POST／live URL／模型／費用／正式發布。CI／Preview 以交付完整 HEAD 的工具結果為準，不用本機 PASS 代替。

CoreMilestoneProgress 是恢復後交付出口成立，不計為新的 live Review 或 M4／M5 成功。下一實際發布仍需試點平台、站點最小授權、live baseline、確切發布確認及提交／讀回契約；這些不阻止獨立 repo 工作。100cap／P3 debt 不擴張。
