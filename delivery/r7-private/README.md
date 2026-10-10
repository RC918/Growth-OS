# R7 私有核稿與登入／保存靜態包

基準 141b114d593566b6c38038000f040c5924322a3a；Owner 2026-10-10 02:55:19 UTC 批准的独立私有 Sites 核稿副本。只交付本目錄，不部署原 repo 或 apps/web，也不攜帶 vercel.json、api、workflow、DB、secret。

## 靜態輸入

將本目錄作 Sites source root，以 dist 為 static directory；父端建立 Site 後依當前 Sites 技能添加正式 project_id/hosting manifest，再由正式 source helper 包裝。本包未建立 Site identity 或 deployment archive，不可把本 Git commit 當作尚不存在的 Sites source commit。

原核稿入口的六檔保持 bytes 不變：dist/index.html、dist/review.mjs、dist/first-result.css、dist/intro-candidate.mjs、dist/intro-r7-review.mjs、dist/intro-r7.json。入口 / 或 /index.html#r7-review；須 HTTPS、正確 HTML/CSS/JS/JSON MIME，同層相對 URL，不作 SPA fallback。README、SHA256.json、verify.mjs 不放進公開 static root。

## 差異與限制

CSS、candidate contract、R7 JSON 與基準 bytes 相同。index.html 保留原 R7 section 與原 UI，刪除分析、舊結果及工作區介面，修改入口標題/header/footer；review.mjs 僅 mount R7，傳入未插入 DOM 的空 input 以沿用原離頁失效契約。intro-r7-review.mjs 差異是 credentials omit → same-origin，以及確認後按鈕顯示「已在本頁確認」；成功狀態移到按鈕旁；redirect:error、固定 frame/run/source/hash 驗證原封不動。只有同源靜態 JSON GET，舊入口無 API、模型或 storage；新增工作區入口見下節。來源引用連結保留，使用者主動點擊才會離站，不自動請求外站。

私有性由父端 Sites 正式 owner-private 設定保證，不由本 HTML 實作。沒有修改原產品 Auth；未宣稱驗證 hosted 權限。頁內確認不保存、不代表原站文案發布或成效；刷新/離頁失效。

## 驗證

從 Growth-OS repo root：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/r7-private/verify.mjs
node --test prototype/intro-trial/r7-review.test.mjs
```

1280/390 Chromium PASS：真 R7 全文、來源/回條、固定 candidate hash；原 bytes 比對；無分析表單；鍵盤確認、複製與拒絕 fallback；刷新、導航、bfcache 失效；資料竄改 fail closed；按鈕>=44px、無橫向溢出；無 POST/外連、localStorage/sessionStorage 寫入或 JS errors。同源 HttpOnly fixture cookie 可讀 JSON（僅模擬保護靜態資產，不是真 Sites Auth）。既有 R7 contract 6/6 PASS。截圖 /tmp/r7-private-1280.png、/tmp/r7-private-390.png；手機目視可讀。

PLAN/CODE/CONTRACT/RUN/DOM/DESKTOP/MOBILE 已完成；buildless 不需 build；DB/Auth/SAVE/LOGOUT/LOGIN/TENANT 不適用本副本，fresh reload/navigation 已驗記憶體 receipt 不恢復。VERIFY 交既有 Reviewer，不自行 APPROVE；Sites 建立、付費判定、實際私有權限和發布後 URL 核對留父端。本輪將新增封裝 E2E 接入既有 R7 CI step；CI 狀態以 exact HEAD run 為準。

## 本輪可發布 artifact（原 a84a90e 之上）

僅發布 `dist/` 的 13 個 allowlisted files；完整清單與逐檔 SHA256 在 `SHA256.json`。原六檔 bytes 完全保留；另加 r7-workspace.html、r7-workspace.mjs、r7-workspace-api.mjs、r7-workspace-runtime.mjs、intro-save.mjs、intro-save-panel.mjs、intro-save-config.mjs。新入口 `/r7-workspace.html` 有返回舊核稿連結。父端直接給新路徑，不改舊 index 的已審內容。`node delivery/r7-private/package.mjs` 重建新增七檔，不包含其他 repo 檔案，亦不自動啟用。

### 需由父端在私有部署副本配置的非秘密值

| 檔案／設定 | 本包預設 | 啟用條件 |
|---|---|---|
| r7-workspace-runtime.mjs `origin` | https://wqepyttadrcnphtyjpjy.supabase.co | 固定唯一新 pilot，不替換舊 staging |
| 同檔 `key` | null | 父正式 connector 取回、確認此 pilot 的 `sb_publishable_` 公開用 key；不接受 service-role／DB secret |
| 同檔 `accessEnabled` | false | 身分建立／SMTP資格／Data API／受限 RLS讀權及callback完成核對後才 true |
| intro-save-config.mjs `introSaveEnabled` | false | 僅實際 verified Owner/org 的伺服器 gate 已在批准一小時內啟用時 true；完成／異常關閉 |
| Auth redirect allowlist | 未設定 | 部署時精確 `location.origin + '/r7-workspace.html'`，無 wildcard/query/hash；只在父私有封裝／平台設定中配置 |

配置副本需重算實際部署 manifest，記錄與本包兩個 config 檔差異；不得把公開 repo 的原始 manifest冒充已配置包 hash。只替換非秘密設定，不把私人 Site URL/ID、email、Auth UUID/org 寫入 repo。私有站存取由既有 Sites 控制，需父端驗證正式登入郵件回來仍保留 fragment 至工作區頁；本 mock 不证明 Sites/Auth live callback。

正式初始身份由父端在已批准流程建立／寄驗證信，Owner本人點信；前端登入維持 `create_user:false`，不開一般註冊。不代填 token、無 signup/verify/admin API、无 refresh token/localStorage/sessionStorage。callback fragment立即清除，access token只在記憶體；先正式 `/auth/v1/user` 驗身分再讀 `r7_members`，未有唯一會員資格則拒絕。無猜測UUID/org。SMTP／recipient eligibility 未確認前不配置開放登入、不發信。

writer false 時，accessEnabled true 的本人仍可新登入並讀回既有版本；保存／確認在 client拒絕，server disable仍是必要安全關閉，不能只關flag。資料 GET 維持org/source/hash限定；lost response仍只核原request，不重送。已批准 SQL三檔 bytes／hash完全不變，本輪無schema變更、遠端migration或啟用。

### 本輪驗證與交審

`node --test prototype/intro-trial/r7-save.test.mjs`：12 PASS，新增停用writer後全新登入exact confirmation讀回且零POST。

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/r7-private/workspace.e2e.mjs`：直接服務dist exact bytes並檢查13檔hash／dependency closure。1280與390 PASS：預設零API、無會員拒絕、精確HTTPScallback與create_user:false、模擬本人驗證callback、一次save/confirm、登出、完全新browsercontext在writer=false讀回exact version/confirmation、零storage、無overflow/JS errors。所有API攔截為in-memory fixture，real remote calls=0；不是正式寄信或GoTrue/Sites驗收。

PLAN/CODE/CONTRACT/RUN/DOM/DESKTOP/MOBILE/SAVE/LOGOUT/FRESH SESSION/READBACK與tenant負測適用，以上為synthetic證據。buildless無build；SQL/RLS bytes未變且沿用a84a90e已通過原生PG17證據，PGlite回歸核新adapter。真Auth／DataAPI／私人callback／Owner信件驗證仍待父正式流程，不宣稱live PASS。交原Reviewer同HEAD；不自行APPROVE、merge或部署。
