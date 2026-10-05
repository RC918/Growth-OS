# 第一成果本頁 Review｜2026-10-03

基準為已由父獨立驗收的 `821aab584a295843a588c09d8fdf33d4e0619d37`，沿用 `feat/passwordless-workspace`／Draft PR #19。方向仍為執行藍圖 v2.0 的 URL → First Useful Result → Review → Publish → Measure；本切片只接通第一成果的本頁 Review，不代表完整 M3 或發布閉環完成。

## 行為與契約

`first-result.html` 的 title、meta description、產品描述可直接編輯，逐欄核對目前文字涉及的事實；無關未知項不阻擋確認。來源原文、facts、snapshot bytes 與 citations 保留不變。修改欄位標示「使用者修改」，原建議引用僅供對照，不自動支持新增宣稱。

確認綁定 original/final URL、snapshot id/source version、內容 revision/content digest 及三欄核對狀態。修改會清除該欄勾選並撤銷確認；核對狀態變更、新來源輸入／提交／取消也撤銷確認。取消修改還原該來源最初產生的建議並清除核對，不恢復舊確認。重複確認共用待完成操作；過期 digest 或來源回覆不能恢復舊確認或覆寫新版本。

Copy 取操作當下可見三欄文字；若非同步剪貼簿操作期間版本改變，不顯示舊操作成功或手動複製內容。Export 對當下版本計算 digest，期間漂移則拒絕舊匯出，允許重試目前版本。JSON 保留來源與引用，新增原建議、使用者修改標記、核對狀態及本頁確認。`snapshot.version` 仍是來源 bytes SHA-256；`review.content_digest` 是帶 `sha256:` 前綴的內容綁定摘要，兩者不同用途。

內容摘要輸入為 JSON `{schema_version:1, original_url, final_url, snapshot_id, source_version, revision, fields}`，fields 順序為 title、meta_description、description；確認紀錄另含 fact_checks。它是本頁一致性資料，不是簽章、所有權或發布授權。

UI 明示「本頁已確認／未保存／未發布」。Review 僅存在分頁記憶體，重新整理會失去；JSON 下載不是工作區保存，也不釋放 SQLite 容量。沒有 Auth／遠端 DB 接線、跨登入恢復、持久歷史、模型或發布功能。

## 已執行驗證

- Review 契約：`node --test prototype/public-audit/first-result-review.test.mjs`，6 tests PASS。涵蓋來源不可變、核對／編輯／取消失效、重複操作、兩種 digest 完成順序、匯出漂移、來源綁定與 hash 失敗重試。
- 受影響 Product API：`test_product_api.py`，3 tests PASS，含新增 Review 模組 HTTP 路由及 JavaScript MIME；未重跑無關 scanner suite。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs`：最終程式版本 1280px／390px 均 PASS，各 22 次真下載。保留原有 16 次回歸並加入 Review、真剪貼簿讀回、來源/hash 保留、取消、來源失效、延遲確認及匯出漂移；無 remote/storage/errors/overflow。

本機瀏覽器為 Chromium 151；既有 CI 使用 145，本次新 commit 的 CI／Preview 仍待父独立審查。最後 E2E 完成後僅補文件，未再修改程式。中途模組路由及匯出漂移提示曾失敗並修正，以上列出修正後結果，不以中途 PASS 取代最終驗證。

本輪全部為本機 fixture；未新增 live POST／產品抓取、模型請求、secret 存取、remote DB／Auth 操作或費用。既有 live Preview 證據仍見 [URL 驗收](URL_First_Result_驗收_2026-10-02.md)，本切片不新增真頁品質或雲端 Copy／Export PASS。
