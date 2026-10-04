# 確切成果版本的量測準備｜2026-10-04

新增位置：`workspace.html` → 已保存 URL 成果 → 展開選定版本 →「量測準備與資料缺口」。可讀取確切版本／候選頁、發布證據狀態與尚缺資料，並手動查看未關聯的網站層背景。未確認版本也可使用，不依賴真人 checkbox；沒有量測成效或發布成功宣稱。

基準 `fca586344d27f21f9a58de7fceaee7262c0b93bd`；父確認 Reviewer `01a1079c` APPROVE、CI `37213885365`／Preview `BTJAAtNWeiLTS14jApryTibExp12` success。原 search-baseline／baseline-report 已處理 origin/date、零／缺日、synthetic／提供者聲明及非因果；workspace-observations 只有 org 列表，尚無成果旁的缺口說明。本次重用解析與報告，未重做 CSV 或資料模型。

## 契約與可見行為

- 重用 `readSavedUrlDelivery` 核對身份、org／role、選定最新或歷史版本、完整 payload／source；觀測讀取前後各核一次，版本／session／資格或來源漂移拒絕。只 GET，同 org 可讀角色均可查看。
- 顯示 exact version ID／版號／歷史分類及候選 URL。核實發布證據與發布時間都未知；版本 Review、匯出、同域或提供者填的發布路徑／日期均不構成發布證據。
- 頁面／版本的基線、後續資料及成效均為 unknown，clicks／impressions=null，causal_claim=false，不以零值代替缺資料。缺口分列發布證據、頁面與資料權限／來源關聯、完整同口徑後續期間，以及 SEO／到站訪問／AI 能見度需分開。
- 列最近最多 20 筆同 org 可讀觀測，沒有依 origin 自動配對或預選。使用者手動選 ID 後，再核 org／ID，沿用 `loadSnapshot`／`growthReport` 重算背景報告；不信任 caller aggregates。格式錯誤／不在清單／跨 org 資料拒絕，不拿舊報告充數。
- 背景標為「網站層背景資料，尚未關聯此頁／版本」，即使同域／同路徑亦然。明確點擊 0／曝光 0 保留；缺日仍未知，曝光零的 CTR 不可計算。背景原 summary／sections 保留 synthetic、提供者聲明與未向 Google 核實等限制；完整網站前後期間差額也不轉為本版效果。
- 續編立即清除、取消後須重新讀取；切版本／session、關閉面板、晚回覆與錯誤不殘留舊資料。資料及聲明以 textContent 顯示，不注入 HTML。

## 驗證

新六組契約／DOM tests：無資料 unknown；owner/viewer/editor 的同域零值、缺日與異域資料僅背景；完整同域前後期間不升格成本版效果；wrong org／ID／malformed snapshot／未知選取／stale version／membership 拒絕；讀取中的版本／role／source／取消／登出／替換 session 拒絕；安全文本／續編清除／晚回應與錯誤維持 unknown。原 11 組 CSV／snapshot／report 測試及交付、發布預覽、Review、mirror／frozen 回歸保留，新 tests 接入同一 CI。

既有 `url-review.e2e.mjs` 沿用真 UI／API＋synthetic transport＋isolated SQL。1280／390 各驗未確認版、新 session 已確認版、Owner 歷史版及 viewer 可讀歷史版；每次先證無自動背景選取，再逐筆手動讀三種觀測：同域明確零、同域缺日、不同域提供者資料。另在 Review write 關閉、沒有觀測時驗 unknown 而非 0。每次檢視前後 observation／audit／content_versions 全查詢結果相同、POST 數不增；原 copy/download、Review／資料保留與 overflow/page-error 斷言仍有效。合成觀測只在 disposable DB 測試 setup 建立，不是 hosted 新資料或發布紀錄。

兩 runtime config 仍為 disabled SHA256 `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`；persistent frozen index 仍 `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351`。無 schema/store/adapter/OAuth、SQL/Auth 變更或 hosted／登入／restore／Save／Review POST／live URL／模型／費用／正式發布。完整同 HEAD CI／Preview 以交付工具結果為準。

CoreMilestoneProgress 是在選定成果旁看懂量測條件與缺口，不是完成 M5 效果驗收。下一可獨立驗證的缺口是頁面級觀測對 exact version／核實發布證據／期間與口徑的關聯契約；目前網站 snapshot 不具有此權威，不可自動補上。真發布及 live 数据授權仍待各自批准；100cap 與 P3 debt 維持 Deferred。
