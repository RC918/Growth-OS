# R7 獨立私有核稿副本（未部署，待原 Reviewer）

基準 141b114d593566b6c38038000f040c5924322a3a；Owner 2026-10-10 02:55:19 UTC 批准的独立私有 Sites 核稿副本。只交付本目錄，不部署原 repo 或 apps/web，也不攜帶 vercel.json、api、workflow、DB、secret。

## 靜態輸入

將本目錄作 Sites source root，以 dist 為 static directory；父端建立 Site 後依當前 Sites 技能添加正式 project_id/hosting manifest，再由正式 source helper 包裝。本包未建立 Site identity 或 deployment archive，不可把本 Git commit 當作尚不存在的 Sites source commit。

發布檔案只有 dist/index.html、dist/review.mjs、dist/first-result.css、dist/intro-candidate.mjs、dist/intro-r7-review.mjs、dist/intro-r7.json。入口 / 或 /index.html#r7-review；須 HTTPS、正確 HTML/CSS/JS/JSON MIME，同層相對 URL，不作 SPA fallback。README、SHA256.json、verify.mjs 不放進公開 static root。

## 差異與限制

CSS、candidate contract、R7 JSON 與基準 bytes 相同。index.html 保留原 R7 section 與原 UI，刪除分析、舊結果及工作區介面，修改入口標題/header/footer；review.mjs 僅 mount R7，傳入未插入 DOM 的空 input 以沿用原離頁失效契約。intro-r7-review.mjs 差異是 credentials omit → same-origin，以及確認後按鈕顯示「已在本頁確認」；成功狀態移到按鈕旁；redirect:error、固定 frame/run/source/hash 驗證原封不動。只有同源靜態 JSON GET，無 API、模型、storage 或工作區入口。來源引用連結保留，使用者主動點擊才會離站，不自動請求外站。

私有性由父端 Sites 正式 owner-private 設定保證，不由本 HTML 實作。沒有修改原產品 Auth；未宣稱驗證 hosted 權限。頁內確認不保存、不代表原站文案發布或成效；刷新/離頁失效。

## 驗證

從 Growth-OS repo root：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/r7-private/verify.mjs
node --test prototype/intro-trial/r7-review.test.mjs
```

1280/390 Chromium PASS：真 R7 全文、來源/回條、固定 candidate hash；原 bytes 比對；無分析表單；鍵盤確認、複製與拒絕 fallback；刷新、導航、bfcache 失效；資料竄改 fail closed；按鈕>=44px、無橫向溢出；無 POST/外連、localStorage/sessionStorage 寫入或 JS errors。同源 HttpOnly fixture cookie 可讀 JSON（僅模擬保護靜態資產，不是真 Sites Auth）。既有 R7 contract 6/6 PASS。截圖 /tmp/r7-private-1280.png、/tmp/r7-private-390.png；手機目視可讀。

PLAN/CODE/CONTRACT/RUN/DOM/DESKTOP/MOBILE 已完成；buildless 不需 build；DB/Auth/SAVE/LOGOUT/LOGIN/TENANT 不適用本副本，fresh reload/navigation 已驗記憶體 receipt 不恢復。VERIFY 交既有 Reviewer，不自行 APPROVE；Sites 建立、付費判定、實際私有權限和發布後 URL 核對留父端。本包無 CI/workflow 更動，CI 狀態不預先宣稱。
