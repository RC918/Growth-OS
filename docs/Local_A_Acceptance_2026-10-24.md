# A：隔離 Playwright 1.58.2 本機驗收

2026-10-24，Asia/Taipei。Owner 直接批准 A：官方來源、指定隔離目錄、三瀏覽器、必要測試補強及本機驗收，完成交原 Reviewer。B、C、Auth 變更、部署、對外發布未批准。

## 固定身份與沿用

- 候選 `product-workspace-A-20261024-r1`；工程 HEAD／PR42 基底 `ddc34e574fa7a3c15755064e8aec3bf8e0a64a0f`，仍有既有未提交成果。沒有 commit／push／CI／部署。
- 本輪產品來源相對已審 r4 未變。只補 `delivery/web-preview/product-workspace.e2e.mjs` 及驗收文件；既有13份code/test來源以r4 manifest對照，除該E2E外一致；115 frozen bytes全相符。package.json／lock、SQL／RLS、Auth、部署設定未改。
- 最終實跑腳本 SHA256：`a42a3c9fbc8539f6442086f62d67b73b0f72476f44d6724051556a37b48a358a`。完整候選／證據manifest在 repo 外 `review/product-workspace-A-20261024/`。
- 保留 r2 原型、r4 的 Chromium 子閉環、原 Reviewer 限域裁決與失敗歷史，不把它們改名成本次同版證據。

## 隔離安裝與實際 runtime

目錄 `/private/tmp/gos-pw-1.58.2-20261024`，以 repo 既有 package／lock 副本執行 `npm ci --ignore-scripts --registry=https://registry.npmjs.org`，cache亦在該目錄。官方 CLI `install chromium firefox webkit` 使用該目錄下 `browsers/`，開啟 `PLAYWRIGHT_SKIP_BROWSER_GC=1`；沒有覆蓋 repo node_modules、既有bundled Playwright或系統瀏覽器，沒有執行npm升級提示。

實際下載來源全為 `https://cdn.playwright.dev/`。安裝記錄含 Chrome for Testing、Chrome Headless Shell、Firefox、WebKit、FFmpeg；套件及瀏覽器合計約1.1GB，保留於指定隔離目錄供後續授權重驗。既有 bundled1.62.1 package.json SHA與r4保存的provenance一致。

| 引擎 | Playwright | browser.version() | revision／位置 | 鍵盤路徑 |
|---|---|---|---|---|
| Chromium | 1.58.2 | 145.0.7632.6 | chromium-1208／隔離目錄 | Tab／Shift-Tab、Space、Enter |
| Firefox | 1.58.2 | 146.0.1 | firefox-1509／隔離目錄 | Tab／Shift-Tab、Space、Enter |
| WebKit | 1.58.2 | 26.0 | webkit-2248／隔離目錄 | macOS Option-Tab／Shift-Option-Tab、Space、Enter |

三者 Node24.19.0、macOS arm64；runtime JSON逐引擎記錄正確 executablePath、實際Playwright版本及package.json SHA。解除前一輪「可能把Chromium override誤記其他引擎」的取證缺口。CI預設仍從lockfile載入，不使用本機override；這不是Linux CI已跑證據。

官方來源：[1.58.2 瀏覽器清單](https://raw.githubusercontent.com/microsoft/playwright/v1.58.2/packages/playwright-core/browsers.json)、[隔離瀏覽器路徑](https://playwright.dev/docs/browsers#managing-browser-binaries)。

## 同版21組完整流程

| 每引擎情境 | viewport | Console／工作台 fixture | 每引擎結果 |
|---|---|---|---|
| normal | 1280×900、390×900 | 原產品頁 | 2 PASS |
| narrow | 1280×900 | main實測360px，導覽保留 | 1 PASS |
| text200 | 1280×900、390×900 | Console與工作台root實測32px | 2 PASS |
| fallback | 1280×900、390×900 | Console與工作台containerType實測normal | 2 PASS |

Chromium7、Firefox7、WebKit7，最終單次執行exit0、21/21；不是拼接不同腳本的成功紀錄。

每一組實際操作：

1. 同派生build產品Console，以合成HTTP來源取得成果，編輯描述、重新檢查、鍵盤勾選與本頁確認。
2. 正常390情境以真導覽按鈕開來源／回成果，核main焦點；各情境保留導覽或其toggle，未套隱藏nav原型fixture。
3. 鍵盤啟動既有handoff，關閉初始未登入工作台，於無opener新分頁以合成session登入；自動帶入成果，不搬JSON、不自動保存，保存前無POST。
4. 交接後標題焦點成立；原生保存歸屬選單鍵盤操作後保持焦點，明確保存v1。
5. 在既有工作台續編v1，修改描述，重新勾選／確認／prepare／保存v2；同opportunity／snapshot，v1完整payload不變。
6. 登出並關閉整個舊context，建立全新context及不同合成session，經產品讀取UI完整載入v2。
7. 完整payload深比較相同；每組恰2保存POST、兩個不同request；沒有重送或其他RPC寫入。Console與最後讀回均無整頁橫向溢出。

另由本機Python直接讀21組原始payloads／requests，逐項確認 v1_original=v1_after、v2_saved=v2_readback、source snapshot相同、42次POST全為既有save_url_result_draft且每組2個不同request。這是作者額外核對，不冒充Reviewer親驗。

證據包含21份四payload原文、21份requests、21份合成disk store、全鍵盤紀錄、42張Console／讀回截圖、最終派生manifest、results及三runtime JSON。所有頁面requests限制為當次loopback origin；沒有真網址重抓、模型、hosted寫入。每組finally關閉context／server，最終關閉browser；程序exit0。

## 失敗與有界修正

- run1：Chromium7組過；Firefox續編從下方描述欄返回上方勾選項時，單向Tab100次無法到達。未當作產品PASS；保留failure與截圖。
- run2：測試改依實際DOM順序使用Tab／Shift-Tab，並保存每步鍵盤／焦點；Firefox7組過。WebKit普通Tab跳過原生checkbox／button，失敗保留。
- run3：WebKit改用macOS Option-Tab／Shift-Option-Tab，7組過；沒有直接focus替代鍵盤到達、沒有加tabindex強迫產品焦點、沒有改OS／瀏覽器偏好。
- final：同一最終腳本重新執行所有三引擎21組全過，另加原始payload／摘要取證。前三輪不併入最終PASS數量。

WebKit按鍵差異有[官方Playwright維護者說明](https://github.com/microsoft/playwright/issues/5609)與[macOS行為紀錄](https://github.com/microsoft/playwright/issues/41808)支持；本次普通Tab跳過的歷史不撤回，不宣稱預設普通Tab在macOS WebKit可到全部控制項。

## 驗證迴圈、獨審與停止範圍

PLAN／測試CODE／既有derived BUILD／Browser DOM／desktop+mobile／narrow+text200+fallback完整保存讀回／新context／exact payload在本包適用且已完成作者驗證。115frozen與既有版本未改另核。既有HTTP／權限契約已於r4批准後18項通過，產品未再改，本輪不無因重跑。

未驗／不放行：正常email／OTP／callback Auth、真正PostgreSQL／RLS、hosted persistence、GitHub CI、Linux runtime、Safari／iOS／Android實機、原生browser zoom／全WCAG、真模型及品質、WordPress／外掛更新、正式環境／對外發布、B／C及整包Beta。

原Reviewer已回覆 **APPROVE_WITH_LIMITS：A本機隔離合成驗收可交付結案，整體產品驗收仍未完成；未見新增P1**。實讀最終E2E全文、21列結果欄位轉表、三份runtime、安裝摘錄及postcheck，確認資料與程式一致；變體均涵蓋v2續編／新context完整讀回及v1保留。

Reviewer未重跑、核原檔hash／raw payload／requests或看pixels；PASS、exit0、42POST、frozen／bytes不變仍屬作者紀錄。本流程混用fill／click與實際Tab／Shift-Tab／Option-Tab／Space／Enter，不是全程純鍵盤填寫。MacWebKit普通Tab失敗歷史保留。裁決不涵蓋B／C、正常emailAuth、PG／RLS、LinuxCI、Safari／實機、hosted或Beta，亦不授權部署／Merge／發布。回覆另存repo外 `review/product-workspace-A-20261024/REVIEWER_DECISION.md`，Primary不自批。

A完成後停在本機驗收交付，不自行啟動B／C、Auth變更、commit／push、部署或發布。
