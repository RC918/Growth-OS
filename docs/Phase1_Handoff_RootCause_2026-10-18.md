# Phase 1 P0：First Result → Workspace 跨網域交接阻塞（根因與修復差異）

## Owner 真人證據（2026-10-18）

First Result（接管分支 Preview）成功取得 BIC00001 並確認版本 → 點擊「登入後保存待審草稿」→ Magic Link 登入成功 → 最終落在另一部署網域 `growth-os-preview-ny0422g6e-morning-ai.vercel.app/workspace.html`，只看到既有資料，未觀察到成果交接或保存。

## 根因（程式證據鏈）

1. 交接設計為**同源分頁訊息**：First Result 以 `window.open('./workspace.html')` 在同一網域開 Workspace 分頁，Workspace 登入後由保存面板向 opener 發出 `url-result-ready`，First Result 才以 `postMessage(..., location.origin)` 傳送成果（`apps/web/first-result-handoff.mjs`、`apps/web/url-result-save.mjs`）。跨網域時來源檢查必然拒絕，且待交接成果只存在於原分頁記憶體。
2. Workspace 送出 Magic Link 時 `redirectTo = location.origin + '/workspace.html'`（`apps/web/workspace.mjs`），且送出前已驗證同源（`workspace-api.mjs` requestMagicLink）。程式端正確。
3. Owner 最終落在**不同部署網域**，代表 Supabase Auth 未接受該 redirectTo 並回退到專案 Site URL。最可能原因：隔離 Staging 專案 `vhzryhibmpvglzcmfnaa` 的 Auth Redirect URLs 允許清單未包含接管分支 Preview 網域。登入本身成功（同一 Supabase 專案工作階段有效），所以 Workspace 能讀既有資料，但交接的 opener 分頁留在原網域，成果無法送達。
4. **即使同源回跳仍不足**（獨立 Reviewer 指出、程式核實）：Magic Link 信件會新開分頁，其 `opener` 為空；登入 token 僅保存在該分頁記憶體（`workspace-api.mjs` 未持久化工作階段），原 Workspace 分頁（opener）永遠等不到登入後的 `ready`。因此自動交接還需要同源跨分頁橋接（見修復）。
5. 部署一致性不是根因：分支別名網域恆指向接管分支最新部署，Vercel 以 `delivery/web-preview/dist` 服務（derived 建置已啟用 Save），Owner 亦已在該網域成功取得最新成果；產品程式自 `69dbfaa` 後僅文件異動。Auth 現行 Site URL／清單與回退紀錄仍待連接器唯讀讀回確認（不影響上述程式層結論）。

## 程式修復（本輪已實作，衍生建置層）

`delivery/web-preview/handoff-bridge.mjs`（新檔，並經 `vercel.json` buildCommand 串接於既有建置之後）：First Result 分頁送出交接時，另把 reviewed payload 放入同源 localStorage（30 分鐘、一次性 nonce、不含任何憑證）；任一同源 Workspace 分頁登入後由既有 `accept()` 完整重驗並領取，成功即刪除。frozen 原檔不動、錨點漂移即建置失敗。與 Auth 差異共同生效才完整：無同源回跳時橋接也不可見，此時既有匯出／匯入仍可人工完成保存。

## 修復差異（Auth 安全設定，待 Owner 核准後由連接器／Dashboard 執行）

在 Supabase Dashboard → Authentication → URL Configuration（僅隔離 Staging `vhzryhibmpvglzcmfnaa`）：

- **新增** Redirect URL：`https://growth-os-preview-git-takeover-muse-primary-20261016-morning-ai.vercel.app/workspace.html`
- Site URL **不變**（避免影響既有登入信流程）；不新增其他網域、不放寬為全域 wildcard。如需未來分支 Preview 亦可登入，再另行核准 `https://growth-os-preview-*-morning-ai.vercel.app/workspace.html`，本次不預設加入。

回復：移除該筆 Redirect URL 即完全回復，無資料變更。

## 核准後驗收（不需重做已通過項目）

Owner 僅需在同一分支 Preview 重新完成一次：取得任一成果 → 點擊保存交接 → 登入 → 確認 Workspace 自動接收並保存。此前 Muse 先以合成帳號在 Staging 驗證 redirect 行為（需 Auth 設定生效後），真人來源核對與登入驗收不重做。

## 狀態

- 已實作（交接與保存程式）：是，同源設計完整且 CI 覆蓋。
- 隔離驗收通過：同源合成路徑是；跨網域真人路徑否（本 P0）。
- 產品驗收通過：否，待 Auth 差異核准與一次真人保存驗收。
- 已正式開放：否。
