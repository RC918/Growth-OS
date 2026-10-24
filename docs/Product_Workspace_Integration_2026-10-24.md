# 第一個限域產品整合包

2026-10-24，Asia/Taipei。Owner 在本對話直接批准；不是一次放行 A1–A8。

## 結果與當前狀態

### 最新：Owner 批准本機隔離驗收後（r4）

Owner 另行明確批准本次本機 HTTP／Playwright 合成驗收；同一台 Mac 的正常 `require_escalated` 審核通過。先前 EPERM 保留為歷史，不換執行者或網路路徑。

- 18 項 HTTP／持久保存／新合成 session／權限／build 契約通過，原始紀錄 `review/product-workspace-integration-20261024/gos-isolated-http-approved.log`。
- Chromium **140.0.7339.186**、既有 bundled Playwright **1.62.1**、Node **24.19.0**，1280／390 的實際產品模組完成：Console 編輯／本頁確認→自動交接預覽→明確保存 v1→既有工作台續編／確認／prepare／保存 v2→登出→關閉舊 context→新合成 session/context→完整 v2 payload 深比較相同。v1 payload 不變，兩次保存不同 request、各一次；無整頁橫向溢出。
- 另核呈現：1280 窄 main **360px**，全域 nav 仍可見且編輯單欄；1280／390 根字級實測 **32px**、單欄；強制 fallback 的 containerType 確為 normal、單欄。390 一般流程用導覽按鈕操作並回焦 main，保存歸屬原生 select 操作後保持焦點。
- r3 測試 fixture 原先用 `html{font-size:32px}`，因優先序輸給產品 `:root`，未真正放大；已改 `:root` 並加入實際 rootFont／mainWidth／containerType 斷言，r4 全部通過。r3 結果仍保留，不能算 200% 證據。
- 頁面 requests 限當次 loopback origin；測試 finally 關閉自己建立的瀏覽器/context/服務。沒有安裝新套件／瀏覽器、呼叫真模型、寫入 hosted、改 Auth 或部署。

**此為本機 Chromium／合成 HTTP 與 session 的子閉環完成，整包產品驗收仍未完成。** CI 鎖定 Playwright 1.58.2 與三瀏覽器未執行；本機 Firefox／WebKit 未提供，不能由 Chromium 推定。CQ 變體僅呈現檢查，未各自完整保存；32px 非原生 browser zoom；不是實機。正常 Supabase 信件登入與新 hosted 同版讀回仍未驗，不以合成 token 冒充。

固定身份：`product-workspace-local-20261024-r4`，code manifest `e6a85cc0dd106d7c2a3cfe0dfa9c4e23e74632c7ebf2132d14c236fa2905c510`；來源工程 HEAD 仍 `ddc34e574…`，未提交差異另以 hash 固定。原始 results／runtime、最終 build manifest、合成 store 與7張截圖保存在 repo 外 `review/product-workspace-integration-20261024/local-r4/`；原 Reviewer 最新裁決另記，Primary 不自批。

原 Reviewer r4 已回覆 **APPROVE_WITH_LIMITS**：親讀精確程式增量、18項原始 logs、完整 results/runtime JSON，確認資料一致（18 PASS／0 FAIL、兩尺寸 v2 讀回／v1保留、root32px／窄欄360／fallback normal／無溢出）。未親跑、讀 Mac檔案、核hash或看pixels；整包產品驗收仍 BLOCKED。Playwright1.62.1取自本機package.json，原始runtime JSON未記版本，另保存package來源／hash補充，不改寫原始runtime。

Technical Debt（P3，待後續CI驗收時處理，負責人待Dot指派）：E2E runtime取證的 executable欄目前各引擎都引用 Chromium override；本次僅Chromium無誤，若未來同時傳override跑Firefox/WebKit會誤記其路徑。位置 `delivery/web-preview/product-workspace.e2e.mjs`，發現於r4原Reviewer靜態審查。影響是未來跨引擎可歸屬性，非本次Chromium結果；本輪不擴修，三引擎與CI仍未驗，再啟三引擎且使用override時先修取證並重核。

### 以下為初次受阻時的範圍與歷史狀態

目標：網址成果經本頁編輯／確認後，不搬 JSON 即帶入既有工作台；明確保存後，正常重新登入完整讀回同一版本。

**目前為未提交的工程候選，產品流程尚未驗收。** 本包沒有新部署，現有 hosted 版本沒有這些修改。新的 HTTP 隔離測試因沙箱拒絕 listen 127.0.0.1（EPERM）而停止；沒有重試、換 port／route／執行者，也不把此工具限制改稱真人必需。

## 基準、既有成果與寫入範圍

- 起始／遠端 PR #42 HEAD：`ddc34e574fa7a3c15755064e8aec3bf8e0a64a0f`；branch `codex/preview-claim-guard-20261023`；本機起始 clean。遠端由 GitHub connector 核實，未 fetch／切分支／重設。可見相關工程 chats 為 idle；這不是全系統排他鎖。
- r2 合成原型及其 APPROVE_WITH_LIMITS、45 張截圖、1222 筆作者紀錄全部保留於 repo 外 `review/wordpress-first-wave/qa-20261024/`，不移作本產品候選證據。
- 既有同版 hosted 手動匯入→保存→正常重新登入→完整 payload 讀回／確切版核准證據沿用歷史範圍，未重跑、未重新背書。它不是自動交接證據，也不代表模型。
- 既有 `createResultHandoff`、派生 bridge、來源／HTML guard、RPC、正常 Auth 及持久資料契約沿用。原 Reviewer 亦沿用。

具體檔案範圍：

| 位置 | 目的 |
|---|---|
| `apps/web/growth-console.html/mjs/css` | 保留既有 Console 視覺與來源／三欄編輯，修正過時的保存入口文案與連結；主交接 CTA；以卡片容器決定單／雙欄，不帶入隱藏導覽 fixture |
| `apps/web/product-workspace.css`、`handoff-focus.mjs` | 既有工作台窄容器按鈕／選單與 textarea；非同步交接僅在 idle／登入區移焦點，不搶正在操作的控制項 |
| `delivery/web-preview/workspace-integration.mjs`、`build.mjs`、`claim-integration.mjs` | 在原派生 build 掛 CSS／焦點；hook 缺漏／重複均拒絕，不改 frozen 保存模組原 bytes |
| `workspace-integration.test.mjs`、`build.test.mjs`、`handoff-bridge.test.mjs` | 焦點與 hook、最終輸出／frozen 身份；既有 bridge 測試改用 fileURLToPath 避免 Mac Unicode 路徑百分比編碼錯誤 |
| `product-workspace.e2e.mjs`、`.github/workflows/handoff-bridge.yml` | 三瀏覽器的產品 UI／完整合成 payload 新 context 讀回候選，與既有真 native／權限套件並列；保留成功／失敗 artifacts |

不變動 SQL／RLS、Auth/callback/Secrets／持久存取、模型、正式環境、部署設定、115 frozen 或 r2 來源。沒有新增平行作者、排程、Checkpoint Commit、Merge 或對外內容。

## 可操作成果與驗收接線

實際產品入口仍為 `/growth-console.html` → 既有 `workspace.html`。本頁確認後「帶入工作區並核對保存」使用既有交接／bridge，自動帶內容不等於自動保存或發布。匯出／匯入保留為既有手動入口，不算自動交接成功。

CI 候選以同一派生 build 及最終 hashes，在 Chromium／Firefox／WebKit 各測 1280／390 viewport、保留導覽的窄主欄、200% 根字級與強制 fallback；Tab／Space／Enter、原生保存歸屬選單保持焦點、交接預覽／明確保存第一版、在既有工作台續編再保存第二版、保留第一版 payload 不變、關閉整個舊 context、新合成 session 讀回第二版完整 payload。要求兩次保存各使用不同 request，沒有重送；不是只測 Console 編輯。窄欄／文字／fallback fixture 僅做呈現檢查，未各走完整保存鏈；只在短命測試輸出，沒有寫入產品 UI，也不是實機、原生 zoom 或舊瀏覽器證據。

候選腳本新增不等於已執行。CI 沒有推送／啟動，以免由 push 觸發未授權部署；目前無新 CI run 或 deployment 身份。既有 native/RLS suites 保留，未重跑未記新 PASS。

## 本輪證據

| 驗證點 | 實際結果 |
|---|---|
| PLAN／CODE | 上述限域候選；既有保存邏輯沿用 |
| UNIT／CONTRACT | 7 項 handoff／flag／focus／derive PASS；28 項 Console task／claim regression PASS |
| BUILD／IDENTITY | 3 項完整派生／hook／最終輸出 hash 檢查 PASS，包含115 frozen bytes 未變 |
| HTTP 保存／權限契約 | 9 個相依案例 listen EPERM，未執行到核心斷言；不是產品 assertion 失敗或 PASS |
| E2E syntax／diff | 新候選語法與 diff whitespace 檢查通過；非瀏覽器執行證據 |
| Browser／DOM／desktop+mobile／narrow／keyboard／200%／fallback | 新整合版本未執行；不借 r2 畫面代替 |
| SAVE→LOGOUT→fresh context→LOGIN→READBACK | 新整合版本未驗；合成工作階段候選不替代正常 email Auth |
| Tenant／permission | 原 guard/RPC 不變；本輪相關 HTTP 測試受同一 listen 限制，未報通過 |
| Independent Review | 原 Reviewer 靜態 APPROVE_WITH_LIMITS；整包 BLOCKED／未完成。已補核工作台續編測試設計，未實跑、未驗 selectors／transport v2／正常登入／完整變體 |

本機紀錄：`/tmp/gos-ui-contract.log`、`/tmp/gos-build-contract.log`、`/tmp/gos-claim-regression.log`；原失敗 `/tmp/gos-integration-contract.log` 保留。source/diff SHA 身份另由本機 evidence manifest 固定，HEAD 不代表未提交候選。

## 停止條件與後續最小依賴

已到工具執行界線：不再重跑被拒的監聽埠，也不改 route 或由 Reviewer 換環境代跑。先完成可獨立審查的來源與 CI 候選後停在工程交付，不宣布產品整合完成。

後續需要一個明確允許的驗收環境／執行範圍，才能真正執行三瀏覽器候選；若要新同版 hosted 正常登入讀回，另需具體部署授權。真模型若需要新費用／憑證，先列供應商、模型、次數、成本上限、來源與輸出品質標準再請准，這包未呼叫模型。禁止以規則／fixture 冒充真模型。

Reviewer 的必要問題可在本包內修正；跨瀏覽器／正常登入／完整產品主張仍要實測。未核准以上依賴前，不 Merge、不新部署、不改 Auth／Secrets、不對外發布，不選下一包。

原 Reviewer 已讀5個新增檔全文及 tracked 修改行，未讀完整基底／本交付文件，未重算 manifest／hash；後續已讀前版完整 E2E 與 workspace v2 精確增量，確認測試設計缺口補足，未確認新增 P1。作者7＋3＋28項 PASS 非 Reviewer 親跑。原回覆另存 repo 外 `review/product-workspace-integration-20261024/REVIEWER_DECISION.md`，不擴張成產品通過。
