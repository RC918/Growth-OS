# 明確服務／工具來源與草稿預覽

起點：`62c295f03b0c11d5a50b88c912a4b0b4414284f1`，`feat/private-host-bootstrap`，既有 Draft PR28／base `feat/private-site-recovery`。Owner 2026-10-08 11:11 UTC批准服務／工具頁來源對照與草稿預覽；父後續明確准許先交付嚴格結構的獨立工程，指定真站適配保持未驗證。舊窗口不沿用，停止條件為本功能交既有Reviewer，不開下一Core或8小時測試。

## 結果與來源契約

Before：First Useful Result僅支援特定Product結構。After：單一schema.org JSON-LD `Service`或`SoftwareApplication`，與main內同型別itemscope、唯一可見H1/itemprop=name和單一p/itemprop=description的正規化文字一致時，回正確頁型、名稱／描述引用與三欄草稿。

不以網域特判，不從任意首段猜描述。多實體／混Product／多型別、錯vocabulary、缺scope、名稱或描述不一致／截斷、巢狀scope、明確hidden／inline隱藏、form/template/互動控制內容均拒絕。非結構一般頁不提升為支援。靜態parser不執行JS或計算外部CSS可見性；契約只證明HTML明確結構與文字一致，不是獨立事實驗真或任意服務頁支援。

來源snapshot保留原URL／finalURL／時間／fingerprint與逐欄引用，JSON-LD引用有script／graph位置。描述保留原文，title取名稱、meta摘錄描述；逐欄`unchanged`或`source_reformatted`，`improvement_verified=false`。UI將原文保留標示「未產生改善」，文字差異標為來源整理，使用者編輯亦不冒來源支持／改善證據。

新頁型只限來源對照、頁內編輯／還原與複製。確認、JSON匯出、工作區handoff關閉，事件handler另有guard；原`first-result-payload.mjs`商品契約不放寬，合成service完整export傳入仍拒絕`INVALID_EVIDENCE_SCHEMA`。未改DB/Auth/API authority／Save／Publish。既有API的短暫SQLite來源cache沿用，不是workspace保存或新DB服務。

## Scope 與必要相依

- `product_source.py`：獨立窄服務契約，原商品抽取／生成邏輯保留。
- `first-result.mjs`／`first-result.html`：新頁型、引用、差異狀態及後段關閉；不是全面英文／翻譯修正。
- `test_service_source.py`、既有`product_ui_fixture.py`／`product-source-ui.e2e.mjs`：純synthetic結構與loopback UI證據。
- `python-tests.yml`僅在原Public audit tests命令加入新測試模組；未觸發CI。
- 本文件／PROJECT_STATUS：局部交審紀錄。

## 本機驗證（2026-10-08，無外連）

1. 在`prototype/public-audit`執行：
   `python3 -B -m unittest -v test_scanner.py test_app.py test_product_source.py test_product_api.py test_service_source.py`
   **44 tests PASS**，含兩種新頁型、全欄未變、歧義/混實體/表單/隱藏/缺scope/錯vocabulary拒絕及既有商品／SSRF／TLS／API回歸。
2. 在repo root執行：
   `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs`
   **1280／390 PASS**：實際本機HTTP／parser／SQLite→瀏覽器預覽／引用／編輯／還原／clipboard讀回，衝突保留舊成果；scripted click不能確認／匯出／開workspace，零額外request／download；software→商品切換恢復原動作。既有商品每尺寸22次真JSON下載及錯誤／取消／late-result regression通過。瀏覽器封鎖非本機origin；上游僅注入example.com合成HTML，零live URL/model/hosted服務。
3. `node --test prototype/public-audit/first-result-review.test.mjs prototype/public-audit/first-result-save-intent.test.mjs`
   **20 tests PASS**，原商品Review／payload契約不放寬。
4. `git diff --check` PASS。初次Python整組從repo root執行使既有test_app相對路徑server無法啟動；查明cwd後按既有CI的public-audit目錄執行通過，未改app。初版新負測誤把input插入JSON字串使其無法解析，修正為只插入可見p；此後用最終契約完整重驗。

本地log SHA256（非秘密synthetic logs；`/tmp`不是遠端交付承諾）：

| 路徑 | SHA256 |
|---|---|
| `/tmp/service-source-python.log` | `dcc81db168d35904e0383c9f8cb30ecef308b80a227a217dad058c1c0374e42d` |
| `/tmp/service-source-ui.log` | `6e9cc5bd54c9e673ff57ce0c01afab58f4fe894f21c0cb8601d8569cf25fec51` |
| `/tmp/service-source-review.log` | `339d09fb14fe1ae7531340b2d674590dfdf91ec6e32c274c9c562d884b676019` |

## Verification loop／action checkpoint

PLAN/CODE/UNIT-CONTRACT/BUILD-RUN/BROWSER-DOM/DESKTOP-MOBILE適用，證據如上。DB/Auth、Save/logout/freshlogin/readback、tenant/publication不在本包；保留後段拒絕證據，不借測試擴張授權。VERIFY為Primary本機結果，仍需既有Reviewer獨立取證／裁決。

共同欄位：task=`service-source-preview`，starting_head=`62c295f03b0c11d5a50b88c912a4b0b4414284f1`；本次沒有沿用或自行設定舊expires_at，依本包完成交審停止。

| action_id | expected_result | status | last_safe_checkpoint / evidence | scope |
|---|---|---|---|---|
| SSP-01 | checkout/PR符合最新批准 | SUCCESS | 本地clean起點；PR28 draft/head/base一致 | readonly Git/GitHub |
| SSP-02 | 取得指定真頁來源契約 | FAILED | Web首次＋一次重試Internal Error；直接HTTPS tunnel403；此後停止，不父代中繼 | 只有已發生的readonly嘗試 |
| SSP-03 | 嚴格新頁型獨立實作與離線驗證 | SUCCESS | 44 Python＋20 Node＋兩尺寸UI PASS | 本文件列明檔案 |
| SSP-04 | 本地commit，準備固定diff | PENDING | 最終handoff補exactHEAD；不為自引用追加commit | 本地Git |
| SSP-05 | remote／CI／既有Reviewer取證 | PENDING | 未確認本次push觸發CI/Preview的免費條件；未push／未觸發／未PRwrite | 只在確認有效批准後接續 |

## 交付層次與未完成項

**一般明確結構頁支援已驗（synthetic）；指定真站適配未驗。** 不持有growthos.genman.work原始HTML，沒有真頁selector/hash，不將父觀察冒本機來源或Reviewer獨審。未再嘗試該受阻URL、不碰第二站、不重試Library、不公開rawHTML。

工程本機可驗；既有Reviewer已確認GitHub metadata正式鏈可讀，新exact-ref仍須先送達才能獨立review。現在無新remote HEAD／CI／Preview receipt，不借舊綠燈。本地commit獲准；push觸發遠端活動的零新增費用／批准條件未能確認，因此只停該相依步驟，不重試已拒PRwrite。交付完整性／內容改善品質／工程審查／自主性各自保留，不宣稱全案例或完整產品PASS。
