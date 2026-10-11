# 第一成果核稿導航：同路由派生輸出

本包只改善現有三欄核稿的下一步引導，沒有新資料來源、登入、保存或發布能力。Vercel當前部署HEAD／同源API可用性未知，不能宣稱本包已上線。

`apps/web/first-result-navigation.mjs` 從既有 `review.view()` 推導單一原因與聚焦CTA：無效文字→已修改未核→其他未核→確認目前版→複製／匯出。未核不是錯誤；編輯文字的來源僅供對照。CTA不執行確認、勾選或修改；狀態更新不移焦點，busy/pending時移除導航CTA，點擊時再核目標存在／可用。完成後仍明示未保存、未發布。

原 `first-result.html/mjs/css` 和 `first-result-review.mjs` 受frozen RC hash約束。本build不改其bytes或RC operator：複製原web資產，只派生HTML與主JS，插入導航區/import與既有refresh後的掛接；每個hook必須恰有一處。`manifest.json` 記每檔原始／輸出SHA256及derived標記，不冒用frozen manifest。輸出與manifest為gitignored build產物；同路由 `/first-result.html`、同 `/api/product-source`、原functions設定均保留。沒有複製Auth config至新服務或擴權。

Reviewer命令（repo根目錄，使用現有依賴）：

```sh
node --test delivery/web-preview/build.test.mjs prototype/public-audit/first-result-review.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node delivery/web-preview/navigation.e2e.mjs
```

build檢查重新建立輸出，核完整原檔集合、僅兩檔派生、其餘byte-identical、所有frozen RC hash與missing/ambiguous hook拒絕。瀏覽器檢查直接讀派生輸出、攔截同源API提供測試資料，無外部網路；這是測試transport，不是新增產品示例頁。1280/390實際鍵盤與DOM驗優先序、精確聚焦、不自動勾選/確認、不搶輸入焦點、編輯保留、confirm pending及late completion、來源取消／換版／late response、取消編輯、複製／真下載匯出、無多餘API/storage/溢出。aria live-region與描述關聯僅屬DOM證據，沒有真人screen reader驗收。

輸出證據 `/tmp/review-navigation-evidence.json`、`/tmp/review-navigation-{1280,390}.png`；CI artifact `review-navigation-evidence` 含派生manifest。靜態ES modules無編譯，實際RUN由上述派生路由驗。DB/SAVE/logout/fresh-login不是本包適用點；原權限與保存流程不重驗、不擴修。未部署/未修Vercel403/未發信/未開writer/無模型或新費用；交原Reviewer，Primary不自行最終驗收。
