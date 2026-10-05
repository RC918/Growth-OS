# 已保存成果的發布前檢視｜2026-10-04

已保存 URL 成果旁新增「發布前版本與差異預覽」，讓 Owner 在版本未確認時也能查看候選目標頁、三欄差異與尚缺條件。這是唯讀準備，不是發布授權或發布成功；未新增平台 adapter、OAuth、RPC、發布紀錄或 Measure。

## 最小缺口與實作

基準 `2ef454682f85015510481a890612f9b45aea9273`，父確認 Reviewer `01a1075a` APPROVE、CI `37209962173` success。既有 typed-draft 已展示版本／原文／來源／未知，URL Review 已核對權威確認，故沿用，不重做。新增 UI 位於既有工作區 `/workspace.html` → 已保存 URL 版本 → 展開完整內容 →「發布前版本與差異預覽」。

- 沿用 `readReviewBase`、`readContentVersion`、`readUrlReview` 與 payload 驗證。每次點讀重新核對身份、Owner membership、最新版本／完整來源與確切 Review；Review 讀取後再核版本與身份，無確認也檢查漂移。API 僅 GET，viewer/editor／foreign、歷史或不一致資料拒絕。
- 顯示精確版本 UUID／版號、Review ID（存在時）、來源識別、候選目標 `snapshot.final_url`。目標是候選，不代表平台或站點所有權；「原文」只來自保存的來源快照，不是假稱即時網站基準或即時外站漂移驗證。
- 三欄 title／meta description／description 原文與已保存待套用內容精確對照，逐欄標有／無差異；不導入未保存 editor 修改。
- 版本未確認使用 `REVIEW_REQUIRED`；原 request 未知保留 `REVIEW_UNKNOWN`，不重送。平台未選、站點權限未驗、live baseline 未知、發布確認缺漏與發布／讀回未接入分列；版本 Review、page receipt、匯出及預覽均不授權發布。`can_publish=false`／`published=false`，發布按鈕永遠 disabled，沒有 dispatcher。
- 續編立即清除預覽，取消後須重新讀取；新 session／版本面板不能沿用舊預覽。非同步晚回覆不渲染，失敗先清舊資料；來源文本使用 textContent。

## 驗證與界線

本地 `node --test` 新預覽五組＋workspace API/mirror＋Review 共 24 tests PASS：三欄精確、未確認／已確認、viewer/editor／foreign、缺 callback、歷史／source drift、Review identity/digest/check mismatch、Owner 撤銷、讀取中新版／來源／role 變更、取消／登出／替換 session、DOM 晚回應／續編清除／安全文本。新契約接入既有 CI。

沿用既有 `url-review.e2e.mjs` 真組裝 UI＋synthetic transport＋isolated SQL，不另造 harness。1280／390 的 success 覆蓋未確認與 exact-confirmed 預覽、三欄對照、所有 blocker、續編清除、新 session、歷史與 viewer 限制；原閉 schema 情境保留。新增 `preview_closed` 使用 schema=true／Review=false，未確認仍可預覽且零 POST、零 review／audit；unknown 原 request 僅 GET。預覽前後 POST 數不增，未替任一產品 checkbox 勾選；既有 success 測試的 synthetic Review 是原測試流程。完整同 HEAD CI／Preview 結果隨交付回報，不以本機 PASS 推定。

actual 兩 config 仍為 persistent disabled SHA256 `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`；frozen index SHA256 `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351` 不變。無 hosted DB／restore／登入／Save／Review POST／live URL／模型／費用／正式發布；父既有 DB27 與安全關閉證據不重跑。

## Owner 永久治理與驗收分層

Owner 15:07／15:11 UTC 指令及 Reviewer `01a10779` APPROVE 已併 [AGENTS](../AGENTS.md)、mission-guardrail 與 engineering-executor。三層必須分開：

| 層級 | 本次分類／處置 |
|---|---|
| A：synthetic 日常測試 | Bolt A fixture 可自動化，既有單一 session regression 已覆蓋 Save→五 checks Review→權威讀回→新版不繼承、SQL 身份／digest／1review1audit、viewer／foreign。不是 HUMAN_REQUIRED，不要求 Owner 勾選，不重建 harness。 |
| hosted 工具執行限制 | 曾拒絕的操作仍不得重試或改 route；保持 hosted closed，不 restore。這不把 synthetic 測試變成人工確認，也不停止獨立 repo 工程。 |
| B：HUMAN_REQUIRED | 只在確切版本涉及不可代理的本人事實、法律／授權或發布意思表示時，才阻擋直接相依步驟。須列未解主張、fixture 無法替代原因、精確頁面與本人最小動作；不憑「未確認」一律套用。 |

Auth／callback／magic-link／OTP 本身改動、RC、重大 milestone 終驗、平台強制真人 challenge 僅保留其中確需本人步驟。其餘安全隔離日常 regression 不依賴 Owner／2FA，tests／CI／Preview／docs 與獨立 Core 繼續；不繞過工具拒絕、不擴 remote／費用／production 權限。

下一 live 依賴是選定單一試點平台、站點最小授權、取得目標當前內容、確切發布確認及發布／讀回契約。此 slice 未作平台決策、未實作正式發布，亦未宣告完整 live M3／M4。100cap 與 P3 文案維持 Deferred；目前 Core 是可見的發布前檢視，不是新增診斷或 maintenance。
