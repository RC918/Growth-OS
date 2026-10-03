# First Result save-intent 純契約｜2026-10-03

基準 `1a21d5486c1640b591aa686944767d99d208b307` 的本頁 Review 已由父獨立接受：push 37082152873／PR 37082156670 success；實際 logs 為 39 scanner/API、6 Review contracts、Chromium 145 的 1280/390 各 22 真下載；Preview `ErnefHeALQZuKdtatikv6CGHDcNx` Ready。此處記錄父提供的驗收，沒有重跑那些套件。

本切片只有未接線的 [`first-result-save-intent.mjs`](../prototype/public-audit/first-result-save-intent.mjs)、合成測試與 CI 接線。沒有 migration、新 RPC、generic review 改動、adapter dispatch、Auth／UI 接線或 remoteSave；不新增 store 或資料庫。它不是持久保存功能或完整 M3。

## 輸入、輸出與綁定

`createFirstResultSaveIntent(exported, fixtureContext)` 接受現有 Review export，以及分開提供、明示 `fixture_only: true` 的合格工作區 fixture context。context 明列 schema_version、organization_id、opportunity_id、request_id、expected_version、owner 角色、approved opportunity、來源／批准決策存在旗標，以及 mapped_source、expected_review_revision、expected_content_digest。mapped_source 包含 original/final URL、snapshot_id、source_version。

上述資格旗標只是合成上下文；沒有查詢 Auth、membership、RLS 或資料庫。既有合格 opportunity 僅供內部 fixture，不會建立或核准機會，不代表一般新用戶保存已解決，也不把完整 Business Profile 導回 URL onboarding。

- 沒有 context：`unmapped`，不推導 organization／opportunity。
- 缺少必要資格或 context 格式錯誤：`ineligible`。
- export 無效、digest／引用／原文／映射不一致：`invalid`。
- 全部一致：`candidate`，只輸出 `first_result_draft_save_intent`，附完整 report、fixture_context 與摘要。所有回傳物件深度凍結，輸入在非同步 digest 前複製，後續呼叫者修改不混入候選版本。

report 不得另外夾帶 organization_id／opportunity_id／request_id／expected_version／fixture_context 造成雙重 scope。切換合法 fixture org、parent、expected_version 或 request_id 會產生不同完整請求摘要；這不證明新的 org membership。没有 session、dispatch、持久冪等登記或競爭控制。

## 保留與驗證

完整保留 title／meta description／description、原文與原建議、snapshot identity／原始 bytes／facts／citations／推論／未知、使用者修改標記與 page-only receipt，不截斷、不 trim、不拼接。原文須對應 facts 同欄值；引用須存在於同一 snapshot／source version／final URL。修改標記由目前文字與原建議比較核對，修改欄引用必須標示僅供對照。

三種摘要分開：

1. `source_digest`：重新從 base64 bytes 算 SHA-256，與 snapshot.version／content_fingerprint 比對；html 必須等於相同 bytes 的 UTF-8 replacement 解碼（保留 BOM）。
2. `content_digest`：依既有 Review 的固定欄位順序重新計算，包含來源 identity、revision 與三欄文字；不信輸入 digest。確認若存在，其來源、revision、digest、三欄已核對狀態必須一致，scope 必須是 page_only。
3. `request_digest`：對完整 report 與 fixture context 的遞迴 key 排序 JSON 算摘要，陣列次序及字串原貌不變。來源陳述／原建議等即使不影響內容摘要，也會影響完整請求摘要。它是候選契約，不是已實作的伺服器冪等協議。

本頁未確認的合法 draft 也可以形成候選；不強迫核准才能準備保存。所有候選明示 `caller_supplied_unverified`，server_authorized／owner_approved／independently_verified／persisted／published 全為 false。原站事實、fetched_at、引用語義及原建議的真實來源不能靠呼叫者可重算的 hash 證明；自洽地改寫這些資料可能通過結構檢查，但會改變完整請求摘要。receipt 絕不轉為 owner 核准或發布權。

URL 檢查為 HTTPS、非空 hostname、無帳密／query／fragment／空白等純格式檢查，**不是 DNS、公開 IP 或 SSRF 安全驗證**，不執行任何 URL 請求。契約限制來源 bytes 1 MiB、總 JSON UTF-8 8 MiB、巢狀深度 24／節點 100000；過大資料拒絕而非裁切。三欄沿用現有 1–2000 JavaScript UTF-16 code units、trim 後不可空，但保存原始字串；Unicode 不正規化，拒絕孤立 surrogate。這些是新純契約的輸入界線，不修改已接受 UI。

## 與 legacy 及未來服務端的邊界

legacy `content_versions` 只有 title（1–160）及 draft_body，不能完整表達三欄與來源／Review。因此每個 candidate 明示 `legacy_compatibility.compatible=false`，即使本次 title 少於 160 也不能直接 dispatch。沒有以截斷、正文拼接、降低 UI 上限或改 generic review 硬接舊 RPC。

未來服務端仍須另行實作與驗收：真 session／membership／tenant、既有 opportunity gates、同租戶 FK、來源完整性及可信度標示、append-only／parent lock／expected version、完整請求的 request-id 冪等及異內容拒絕、競爭與晚回覆、防止本頁 receipt 升格、交易式 audit、保存後精確讀回與結果不明恢復。具體 migration／RPC／ACL／Auth／遠端操作另批；本契約不證明任何一項已通過。

原 20 張業務表、13 筆歷史、模型帳務均未操作。公共 SQLite 100 snapshot 上限與非破壞保留不變；candidate／JSON 匯出不釋放容量，也不是可以回收快照的證據。

## 本輪實際驗證

`node --test prototype/public-audit/first-result-save-intent.test.mjs`：**11 tests PASS**。涵蓋來源／引用／digest tamper、stale receipt、scope／映射漂移、缺資格、大小／JSON／Unicode、原文與修改歸屬完整保留、候選不可變、完整請求摘要及 UTF-8 BOM。最後一項由實際 Python snapshot builder 使用注入的合成 HTML，經現有 Review export 送入新契約；DNS／connection 設為拒絕，不跑既有 scanner suite、不進行 live 抓取。

只將新測試加進既有 CI；新 SHA 的 CI／Preview 結果仍待父獨立核對。本輪沒有模型、費用、secret、遠端 DB、權限變更、登入、發布或 merge。
