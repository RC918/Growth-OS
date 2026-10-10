# W1：答案影響相關成果（隔離交付）

此包讓商家在同一成果頁回答「產品是否支援戶外使用」、略過或修正。答案保存在原生 PostgreSQL；新答案與相依草稿一起提交，舊版不變，舊確認不再是目前權威。只更新同產品／市場，不改其他產品。全部產品、來源與規則候選醒目標示 synthetic，不代表真模型品質、正式部署、發布或成效。

## 可操作入口

在 repo 根目錄、已具備既有 pinned PG17／GoTrue／PostgREST Docker images 的環境：

```sh
node prototype/product-fact/runner.mjs --serve-isolated
```

開啟命令印出的 loopback URL，選「商家 Owner」登入 → 選產品／市場 → 略過或回答 → 保存新草稿 → 核對確切版 → 登出 → 新瀏覽器 context 再登入讀回 → 修正答案，看到新版與舊確認失效。Viewer 只讀；另一工作區看不到原工作區產品。來源和版本預設收合，已確認答案不重問，按「修正已保存答案」才展開。

runner 使用既有 `prototype/private-site/recovery/native-fixture.mjs`，真 GoTrue password grant 只建立 runner-owned synthetic identities，無 SMTP／OTP／Owner 登入。API 只轉送此 run 的 native Auth/PostgREST，無 hosted fallback、公開 key 或遠端配置。token 只在記憶體；每個 API 動作驗 native user，logout 撤銷 session；前端不使用 browser storage。

資料在隔離 DB 內跨登出／新 session 保存；runner 停止時移除本次 owned containers/network，最長 30 分鐘自動清理。**這不是跨 runner 重啟的正式長期保存服務。** Ctrl-C 可提早結束。沒有背景排程、對外部署、模型呼叫或發布功能。普通靜態站沒有 `/w1/*` API，不會啟用這個流程。

## SQL 契約與復用界線

- `supabase/drafts/product_fact/install.sql` 是未部署候選，預設所有 W1 ACL 關閉；`enable-isolated.sql` 只由本機 runner 套用，未核准遠端執行。
- 復用既有 organization membership／`private.has_org_role`、native Auth/PostgREST fixture、`first-result.css`。現有 `first-result-payload`／R7 固定 frame 不接受一般商家事實，因此新增獨立有界答案契約，不改原 validator、payload 或 frozen workspace。
- 五張表分別保存 scoped products／immutable facts／immutable dependent drafts／immutable exact reviews／idempotent requests；`w1_state` 為 security-invoker view，與原表同受 tenant RLS。API 無直接資料表寫權。
- 公開 invoker wrapper 呼叫 private definer，內部重驗 owner／org／product；request advisory lock + product row lock 序列化回答、確認和來源更新。所有插入在單一交易，最後一步失敗全部回滾。業務衝突用 `PT409`，避免被當 SQL serialization failure 自動重試。
- 答案保留產品／市場／渠道、來源 URL／quote／version、建立者、確認者／時間與來源類型。skip 保持 unknown、無確認者／確認時間，不能清掉已確認答案。新版取代關係由同產品遞增版本表達，不覆寫舊列。
- `w1_state.review_valid` 才是目前有效性：latest fact → dependent draft → exact review，且 source version 未變、沒有來源衝突。舊 review row 是歷史紀錄，不是當前批准，更不是發布授權。W2 若接入必須重核同樣的權威依賴，不能只查 review row 存在。
- 來源漂移／矛盾由讀回呈現；不覆寫商家答案。W1 沒有自動 scanner／網站變更 ingestion；測試只在 fixture 中模擬觀察變化，真來源 ingestion 屬後續工作。
- 成功以 request receipt 與權威 state 讀回為準。模擬「DB 已提交但 upstream 回覆遺失」以 502 呈現，UI 僅 GET 原 request，沒有自動或手動重送。已知拒絕 400／401／403／409 保留輸入，可讀最新版本恢復；未知保持阻擋原操作。

## 驗證

```sh
node prototype/product-fact/verify.mjs
node --test --test-name-pattern='frozen RC candidate bytes' prototype/internal-rc/contract.test.mjs
```

若 executor 使用系統 Chromium，命令前設 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`；CI 沿既有 Playwright 安裝。

原生 PG17／GoTrue／PostgREST 權限、原子回滾、併發 Save／Review、scope、來源衝突、不可變歷史、request 冪等、新 JWT／撤銷 refresh 與 exact readback；1280／390 Chromium 真 UI 包含鍵盤、skip、回答、保存、確認、lost reply、全新 context、viewer、近端說明、輸入保留、無 storage／水平溢出。非 mock DB，資料與身分是 synthetic；不證明正式 magic-link 或 live Auth 已開放。

輸出：`/tmp/w1-product-fact-evidence.json`、`/tmp/w1-product-fact-1280.png`、`/tmp/w1-product-fact-390.png`。既有 CI 追加相同 W1 驗證及 artifact；same-HEAD run 終態另附交審回條。只改 W1 新檔、必要 CI 與 status；R7 與 frozen bytes 保留。獨立 Reviewer 裁決另記，不自行 APPROVE。
