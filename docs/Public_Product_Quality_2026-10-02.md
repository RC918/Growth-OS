# 真實公開產品頁品質：有界評估

檢查時間：2026-10-02 17:08 UTC。程式基準：`8f1f17cbe323d513f6786c5a5349b36bbc920565`，`feat/passwordless-workspace`。唯一方向沿用 v2.0 URL → First Useful Result → Review → Publish → Measure。

**結論：本環境的三個 live 嘗試均停在 robots 讀取，沒有取得商品頁。真實產品品質尚未驗收；不是產品頁被判定 unsupported，也不是商品內容品質 FAIL。** 沒有據此猜測並修改功能。

## 實測與保存範圍

以 `build_snapshot(url, fetch=observed)` 呼叫既有完整路徑；observed 只記錄呼叫資訊並原樣委派 `scanner.fetch_once`，未替換 DNS／TLS／robots／HTTP 回應。保留既有 HTTPS、公開位址、每次 5 秒／1 MB、redirect／request 數限制。未呼叫模型或付費服務、未登入、未寫外部網站。

| 候選公開示範商品 URL | 本機 request 實測 | 對外結果 | 頁面與品質結果 |
|---|---|---|---|
| [Books to Scrape — A Light in the Attic](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html) | `/robots.txt`，0.002 秒，`dns_failed` | `robots_unavailable`，停止 | 未抓商品頁；無 snapshot/facts/preview |
| [ScrapeMe — Bulbasaur](https://scrapeme.live/shop/Bulbasaur/) | `/robots.txt`，5.000 秒，`timeout` | `robots_unavailable`，停止 | 未抓商品頁；無 snapshot/facts/preview |
| [Web Scraper 公開測試商品候選](https://webscraper.io/test-sites/e-commerce/allinone/product/1) | `/robots.txt`，0.002 秒，`dns_failed` | `robots_unavailable`，停止 | 商品路徑有效性亦未由 scanner 核實；無 snapshot/facts/preview |

共 3 個 URL、3 次 fetch 呼叫；每個只有 robots 階段，沒有 HTTP response status/body，沒有重試或第四個來源。ScrapeMe 的記錄只證明 robots fetch timeout，未定位到 DNS/TCP/TLS 哪一子階段；不把連線限制歸咎網站。沒有 robots 許可就不繼續抓產品，也沒有改用 proxy、固定 IP、較長 timeout 或搜尋快取餵入 parser。

[機器可讀記錄](Public_Product_Quality_2026-10-02.json)僅保存 URL、UTC 時間、elapsed、error 與 request 數。沒有取得內容，因此商品內容指紋／短摘錄均為「未取得」，不製造空內容指紋。未保存完整網頁、商品描述、模型資料、cookies、個資或 SQLite 快照。

選頁時搜尋工具可讀到 Books to Scrape 的示範聲明及 ScrapeMe 商品頁；這只供選擇公開候選，**不是本機 scanner live PASS**，不將工具快取或顯示內容冒充來源快照。

## 品質判斷與證據層級

- Live 本機：robots 無法核對即停止的行為已觀察；supported/unsupported 分類、產品名稱／描述／特性歸屬、建議引用、不捏造與可直接使用性全部 **未評估**。本輪產生成果 0/3；無已確認可支援的真頁樣本。
- Fixture／CI：父已獨立確認 `8f1f17c` 的 push 37037554882／PR 37037562443，在 Chromium 145.0.7632.6 通過 32 scanner/API tests 與 1280/390 各 12 次真下載，含 JSON/version/hash、keyboard、cancel、late-result。原下載限流 CI blocker 已解除。這些證明工程契約，不代替真商品品質。
- 恢復：本次錯誤可由現有 `robots_unavailable` UI 顯示；輸入／最後成功成果保留仍引用上述 fixture/E2E 證據，本輪未另做 live browser 恢復驗收。
- Cloud：GitHub Preview Ready 為父提供的部署證據；protected cloud UI/POST/外部 fetch 尚未驗收。本輪未開啟雲端 URL、未登入或呼叫 Vercel API。
- 即使日後真頁產生三項文本，仍需人類判斷改善包可採用性；來源摘錄與測試 PASS 不等於品質、發布或成效完成。

## 下一次 Preview 驗收的最少操作

既有文件 `Goal_Intake_M1_驗收_2026-09-30.md` 記載固定分支 alias；本機 `apps/web/first-result.html` 及 `api/product-source.py` 提供以下**精確預定入口**：

- UI：`https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/first-result.html`
- 同源 API：`https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/api/product-source`

這是歷史已記錄 alias 加現有路由，**不是本輪重新核實的 immutable deployment URL 或當前 SHA 證據**。父先從現有 GitHub deployment/check 證據核對它仍指向待驗 head；若不能核對，提供 PR #19 該 SHA 的確切 Preview deployment URL 後才進行。不得改用 Production 網域。

最少 Owner 批准／操作是：允許僅對上述已核對的 Growth OS Preview 做瀏覽器驗收，並由 Owner 自行在受保護頁完成既有 Vercel SSO。Agent 不收取密碼／OTP／cookie、不操作登入、不關閉保護、不新增 bypass token；若不能提供已授權可用頁面，雲端步驟保持 blocked。**不需要新的產品 Supabase 登入、OAuth、callback、Auth/RLS 或網域設定。** 網域中的既有 team slug 不授權操作其他專案。

授權後的窄範圍：開 UI；由頁面同源 POST 提交本表最多 3 個公開候選（單次、遇 robots/bot/access 拒絕停止，不繞過）。這可能在 Preview 的既有 `/tmp` 暫存新增最多 3 筆來源，無 remote DB／正式資料／對外發布。記錄 UI/POST 狀態、來源 URL、timestamp、fingerprint、每欄 citation 存在與產品歸屬判讀；成功才檢查 title/meta/description 可用性及 Copy/Export，失敗則核對輸入與先前成功成果保留。只分享必要短摘錄及 hash，不上傳整頁或 secrets。滿額就記錄限制，不清空 100 筆快照。

## 最小下一步

先在**已授權且具既有安全外連能力**的 Preview 完成一次同路徑 robots→商品讀取，取得第一個真頁分類證據；仍無支援頁就明確記錄 coverage gap。只有取得內容後證實屬普通 scope bug，才轉成最小合成 fixture 修復。當前沒有足以支持 parser 擴張的 live 證據，不新增模型／架構，也不解除現有安全邊界。容量生命週期與跨登入保存不屬這次品質評估。

## 父提供的受限 Preview 觀察（後續證據）

Owner 另批准父提交 Books to Scrape／ScrapeMe 兩個指定 URL 各一次，最多 2 筆暫存。父回報已於 17:37 核對 GitHub HEAD `3ad934a23afb5c54ba7fbe5242da063268fd212f`、deployment `GQKPriANVwhGWtoickXj2s8rCdZa` 與固定分支 alias 一致，瀏覽器可直接載入／提交，當次不需 SSO 登入。這更新了前文「尚未進行 cloud 互動」的時間點；不表示移除部署保護或未來都不需 SSO。

- 17:39 Books to Scrape：UI 顯示無法核對 robots、已停止；網址保留。
- 17:40 ScrapeMe Bulbasaur：UI 顯示已找到名稱但無法歸屬必要公開描述，沒有產生可用成果。
- 以上時刻依父回報，未另提供時區或逐請求部署 response metadata；版本證據是提交前的 GitHub deployment/alias 映射。分支 alias 可移動，不能視為每個 request 的 immutable SHA 證明。
- 兩次提交／UI 安全 fallback 有實際證據；snapshot 寫入數沒有直接讀 DB，**不能記為 0**。本輪 agent 沒有追加 live POST 或重抓任何相關域名。

父另以唯讀 DOM 觀察確認 ScrapeMe 的 `main#main` → `div#product-759.product.type-product` → `div.summary.entry-summary` → `h1.product_title.entry-title`，同產品的 `div.woocommerce-product-details__short-description` 與 `#tab-description` 含一致描述，related products 為另一區；沒有 Product microdata。此結構證據支持下方狹窄 parser 修復；未保存網站長文。真實可用成果品質仍未 PASS，修復後 live 重測須由父另處理授權。
