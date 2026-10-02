# URL → Source Snapshot → First Useful Result 驗收

日期：2026-10-02（台北）。依[唯一藍圖 v2.0](AI_Company_Growth_OS_執行藍圖_v1.md)，本輪為新 M1 最小契約與 M2 預覽，沿用 public scanner；沒有新增 plan/work-card/對話 onboarding。

## 交付

首頁主要入口指向 `apps/web/first-result.html`。提交公開 HTTPS canonical URL → robots/DNS/實際連線/redirect 安全讀取 → Source Snapshot → Product Facts → 三項可複製文本。無法可靠辨識產品才要求選擇產品候選；失敗保留輸入。

快照包含 original/final URL、UTC fetched_at、SHA-256 content/version fingerprint、原始 bytes base64、解碼 HTML 與引用。引用有 snapshot_id/source_version/URL/locator/quote。SQLite insert 後完整讀回比對；重掃另建 ID、不覆寫舊快照。

Fact 僅表示來源陳述（source_asserted），不代表已獨立核實；產品類型與候選是 inference；缺失／未抽取資訊是 unknown。頁面 script 不執行；忽略無可见來源支持的 schema 價格等資訊。無模型、工具調用、secret 或權限操作。

預覽提供 title、meta description、產品描述的原文／建議、改善理由、逐項來源與待確認事實。採來源摘錄／重組規則，不宣稱 SEO 成效。Copy 以真正 clipboard API 操作；拒絕時提供選取文本。Export JSON 同時保留成果與完整來源。固定 awaiting_review/published=false，沒有發布操作。

## 驗收證據

`python3 -B -m unittest -v test_scanner.py test_app.py test_product_source.py test_product_api.py` 在 prototype/public-audit 執行：24 tests PASS。包含既有 scanner/app 回歸及新增 18 項測試。

| 驗收 | 證據 |
|---|---|
| 正常產品頁／redirect | ProductTests 的 snapshot_preview_and_citations、redirect_and_final_source PASS |
| 首頁／分類頁候選、unsupported fallback | non_product_candidates_and_unsupported PASS；候選只推論不自動抓取 |
| timeout／oversized | TransportTests 的 timeout_and_oversized_declared_and_stream、deadline_stops_trickle PASS |
| SSRF／private IPv4/IPv6／redirect-to-private | malformed_credentials_query_and_private_urls、redirect_to_private_and_request_cap PASS |
| DNS／實際 peer／TLS SNI | dns_timeout_and_rebinding_before_connect、peer_mismatch_and_tls_name PASS |
| malformed URL／restricted content | malformed_credentials_query_and_private_urls、restricted_and_non_html PASS |
| 來源引用／版本可追溯 | 原始 bytes SHA-256、所有引用 ID／snapshot/version 檢查 PASS |
| 不可支持宣稱／缺失事實 | schema_mismatch_and_multiple_products_are_not_fact、missing_description_does_not_fake_useful_result、untrusted_script_is_not_a_tool_or_fact PASS |
| HTTP／SQLite 保存讀回／限額 | ApiTests 2 項 PASS，實際 localhost server、SQLite |
| desktop 1280px／mobile 390px | product-source-ui.e2e.mjs PASS |
| 原文／建議、source citation、missing facts、Copy／Export、不顯示已發布 | 同一 E2E PASS；真 clipboard、下載 JSON 及原始 bytes hash 驗證 |

Browser E2E 經真 HTTP endpoint、parser、SQLite；外部 HTTPS transport 為固定 fixture。Transport 測試使用受控 DNS/socket/HTTP 替身，包括實際連線位址檢查分支。這些 PASS 不等於任意公開網站或雲端 POST 已驗收。

CI 已加入上述新增案例；同 commit CI／Preview 結果以 PR #19 checks 為準，不把 echo build 當 build/lint/typecheck 品質證據。

## 本機使用

```bash
COMMERCE_GROWTH_DB=/tmp/growth-os-source-preview.sqlite3 python3 -B prototype/public-audit/app.py
```

開啟 http://127.0.0.1:8080/first-result.html。靜態 http.server 只能展示檔案，不提供 API。

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/growth-os-playwright node prototype/public-audit/product-source-ui.e2e.mjs
```

CI 會正常安裝 Chromium，本機 browser path 依實際安裝調整。

## 界線與下一切片

僅 HTTPS 443、query-free URL、同 hostname redirect（最多 2 次）。每次 request 5 秒／1 MB，robots 加頁面總 request ≤6；DNS pool/queue、同時 scan、每 IP 每小時请求、快照列数均有界。robots 無法核對即停止。靜態單產品辨識要求 Product JSON-LD 名稱與可見 h1 一致，或 product Open Graph 與單一 h1；其他頁保守 fallback。登入／密碼／401/403 不讀。

SQLite 只在本機／serverless /tmp 暫存，最多 100 筆；不是 tenant DB、跨登入保存或永久來源庫。Preview throttle 為 process-local，不宣稱分散式防濫用。部署整合沿用 PR 自動 Preview，未改 production／Auth/RLS／付費／OAuth。官方設定依據：[Python API function](https://vercel.com/docs/functions/runtimes/python/api-directory)、[functions includeFiles/maxDuration](https://vercel.com/docs/project-configuration/vercel-json#functions)。

新 M1/M2 仍不視為全面完成：真實目標產品頁品質、雲端 runtime、跨登入保存與成果適用性需逐項驗收。下一個最小工程切片應補當前契約／品質缺口，然後接來源版本約束的 Review；發布與 Measure 不以匯出替代。

Follow-up security regression: malformed candidate URL no longer hides valid candidates; HTML depth <=128, elements <=20000 and per-element captured text <=2000. Both added cases PASS; parser-limit recovery also checked on desktop/mobile. First slice 3bb7245 same-head CI runs 36990198565 / 36990203644 and Preview checks PASS. Preview HTTP redirects to Vercel SSO; cloud UI/POST runtime is not verified and no login bypass was attempted.

SSRF follow-up: Azure host-platform virtual address 168.63.129.16 and IPv4-mapped variants are explicitly blocked, in addition to all non-global or mixed public/private DNS answers. Regression reproduced before correction and passes afterwards. [Platform IP documentation](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16). No actual platform endpoint was contacted.

## HTTP parsing deadline follow-up (2026-10-02)

Baseline: `6663b7f2fb01dab383c1dd5faa5cdeb82d3ee4ad`. Parent independently reported push CI 36991068476 (literal checkout), PR CI 36991073075 (merge ref), 24 scanner/API tests, 1280/390 URL-source E2E and Preview Ready at that baseline. These are not checks for this follow-up commit.

Reproduced with the real Python HTTPResponse parser over local socket pairs, without external requests: at a shortened 0.2-second request deadline, status-line/header/chunk-header trickles returned only after approximately 1.01/1.13/0.72 seconds. Each byte arrived before the socket inactivity timeout, so internal parser reads exceeded the shared deadline.

The response socket file now applies the remaining absolute request deadline at every underlying read. HTTP parsing stays in the standard library. Explicit response cleanup also covers responses whose Connection: close transfers socket ownership away from the connection; the captured response socket remains available for body timeout updates.

Validation: `python3 -B -m unittest -v test_scanner.py test_app.py test_product_source.py test_product_api.py` — **26 tests PASS**. New socket-pair coverage includes status/header/chunk-header trickle (each returns timeout below a 0.6-second scheduling tolerance for the 0.2-second configured deadline) and normal content-length/chunked/connection-close bodies, with socket closure checks. Existing DNS, pinned peer/TLS name, body trickle, SSRF, redirect, parser, snapshot/API tests remain PASS. `git diff --check` PASS. No UI changes; prior desktop/mobile evidence is retained, not represented as a new run. No model/ledger, login, cloud-runtime, production or live-product validation was performed.

Remaining reproduced issues, outside this transport slice:

- A fixture with a delivery paragraph preceding the product description and an unrelated drill feature inside main/aside selected delivery as the description and the drill's 900-watt claim as a product feature. Product identity matching does not establish ownership of every main/article paragraph/list item. Next product-quality slice should require product-specific evidence and degrade safely when ambiguous.
- A temporary SQLite fixture filled with 100 snapshots still rejected the next snapshot with `snapshot_capacity` after JSON export; all 100 rows remained. UI code clears the current result on submit/input before the new request succeeds. Export does not reclaim capacity; no recovery path has been validated. Preserve recoverable results and define bounded cache lifecycle without deleting production data.

PR #19 API previously returned Forbidden. Do not retry or bypass; parent must update the PR description and independently verify checks for the new head. Cross-login persistence, SSO runtime interaction, real product quality, Review/Publish/Measure and pilot acceptance remain open.

## TCP / TLS / send deadline follow-up (2026-10-02)

Parent independently accepted `1ec65b42e7b1aa3cc7f8c1462d3d8c5028973af1`: push CI 37032327865 (literal head), PR CI 37032335907 (merge ref), 26 scanner/API tests and fresh 1280/390 URL E2E PASS; parent synchronized PR #19. Those checks apply to the preceding parser fix, not this follow-up.

Reproduction kept the actual PinnedHTTPSConnection connect/request/send orchestration and replaced only socket I/O with operations that consume their configured timeout against a controlled clock. TCP/TLS/send delays of 2/2/2 seconds consumed 6 seconds; 1/5/0 consumed 6 seconds; 1/1/5 consumed 7 seconds against the 5-second deadline. All stages incorrectly reused a 5-second budget. A normal 1/1/1 case also exposed the unchanged TLS/send budgets.

Fix: bind the fetch's existing remaining-time callback to the pinned connection; recompute before TCP, before and after TLS wrapping, and before/after request send. Explicitly connect before inherited send so handshake time is deducted from sendall's operation timeout. On handshake/setup failure close the raw socket and any assigned TLS socket. DNS/peer/SNI validation and HTTP parser behavior remain intact.

Validation: **28 scanner/API tests PASS** with the existing four-module unittest command. New phase test covers TCP, TLS and send timeouts, combined elapsed <=5 seconds, successful TLS/send with budgets 5/4/3, hostname forwarding and resource cleanup. A real local TLS handshake stalled after a delayed TCP phase also times out within 0.42 seconds for a configured 0.3-second deadline (0.15-second injected TCP delay), closing its socket; this uses no external requests, credentials or certificates. Normal TLS completion is exercised with a controlled SSL context, not claimed as a real external TLS acceptance. Existing real HTTP parser/body and connection-close tests remain PASS. `git diff --check` PASS.

This commit is restricted to the transport deadline. Product-fact ownership and snapshot-capacity recovery remain queued for separate slices after independent acceptance. New-head CI/Preview and PR description synchronization remain with the parent; no PR API retry, model/ledger run, login, production or publishing action.

## Product fact ownership follow-up (2026-10-02)

Parent accepted transport head `f4f8700800603590afb13aaf7b93d5aa64436db3`: push CI 37033777763 literal head, PR CI 37033785378 merge ref, 28 scanner/API tests, fresh 1280/390 URL E2E and Preview Ready. Transport is unchanged here.

Before correction, the new mixed fixture selected a delivery paragraph as Bolt A's description; unscoped/conflicting descriptions and an additional unmatched product h1 also incorrectly produced a preview. The regression tests failed before implementation.

The supported extraction contract is now deliberately narrower: require one visible h1 agreeing with Product JSON-LD (or the existing OG-product fallback) for page identity. To extract description/features, that h1 must be an explicit name property in a schema.org Product itemscope. Paragraph description and list additionalProperty must explicitly belong to that same nearest itemscope. Nested itemscope data, aside/navigation/footer content, and properties containing nested/blocked content are excluded. Conflicting scope names or distinct descriptions yield unknown description and no preview; multiple h1 headings yield unsupported/candidates. Unmarked list items become unknown features, even inside main. No inferred product ownership from position or proximity.

Each accepted description/feature includes product_scope (scope locator, name locator, product name) and its existing quote citation plus the name citation. Raw snapshot/version semantics are unchanged. Normal supported fixtures still produce title/meta/description, copy/export and source provenance. The original broad unmarked fixture has been replaced by explicit microdata for the supported case, with unmarked scope/property variants now tested as deliberate safe degradation. JSON-LD name plus arbitrary main text alone no longer suffices. Microdata remains a source assertion, not independent truth; incorrectly labeled source data is not solved by this patch. Wider unmarked-page extraction and real target-product quality require separate evidence.

Validation: **31 scanner/API tests PASS** using the existing four-module unittest command. New tests cover delivery text before the real description, unmarked promotional lists, marked aside recommendations, nested Product recommendations, embedded foreign scope, conflicting names/descriptions, absent scope/property, multiple headings, ownership citation linkage and unknown features. **Fresh desktop 1280 / mobile 390 E2E PASS**, including mixed-content preview, unscoped explanation and multiple-product fallback alongside existing copy/export/citation/recovery checks; no remote requests, storage, console errors or overflow. Run locally with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs`; optional executable override leaves CI's normal Playwright browser selection unchanged. Dependencies installed from the unchanged lockfile, with npm cache under /tmp. `git diff --check` PASS.

Capacity/result preservation is intentionally unchanged and remains the next independent slice after acceptance. PR API was not retried. New-head CI/Preview and PR description synchronization remain with the parent. No cloud SSO, models, Auth/RLS changes, production data or publishing actions.

## Last successful result / capacity recovery follow-up (2026-10-02)

Parent accepted product-ownership head `4038fa737a39cafb645768bed7caf6fff7ec18b1`: push CI 37035181817 literal head, PR CI 37035190141 merge ref, 31 scanner/API tests, fresh 1280/390 E2E and Preview Ready. Those checks precede this change.

Reproduced the loss with an E2E assertion requiring the successful result to remain visible after a subsequent failed request: FAIL before correction. The page now replaces its current result only when a request produces a new preview. Input edits, unsupported/ambiguous results, timeout, capacity rejection and cancellation retain the last successful preview and export object. A visible source URL/version label distinguishes that result from the edited input. Retention is in this page's memory only; reload/closing the page still loses it. Clipboard/export status is separate from request errors so exporting does not conceal why a new request failed.

Repeated submissions while pending are ignored. Input changes/cancel abort the request and advance its epoch; late successful replies cannot replace a newer result or cancelled state, even if transport ignores AbortSignal. Cancellation stops waiting, not a promise to reverse work already received by the server. The explicit cancel control, submit, copy and export support keyboard activation.

Capacity behavior remains bounded and non-destructive: 100 snapshots maximum, no automatic deletion, no cleanup endpoint, no new storage architecture or remote DB access. API/UI wording now states that exporting backs up a result and does **not** free capacity. The current page's previous successful result remains exportable; a fresh page without a result does not invent one or retrieve unrelated snapshots. Restoring writes at full capacity remains unresolved pending an authorized storage-lifecycle decision; this patch does not claim to solve it.

Validation: **32 scanner/API tests PASS** with the existing four-module unittest command. A temporary SQLite capacity test fills all 100 rows, serializes an export, rejects a new snapshot, and compares every stored id/payload unchanged. **Fresh 1280/390 URL E2E PASS** covers empty-state capacity refusal, successful result retained across edited input/timeout/unsupported/capacity, actual keyboard clipboard/export with complete JSON equality and original-byte SHA-256 verification, cancellation, duplicate submit, and out-of-order responses ignoring abort. Existing product ownership/candidate/recovery checks remain PASS; no remote requests, browser storage, errors or overflow. Local browser command uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. `git diff --check` PASS.

New-head CI/Preview and PR description are for parent verification/synchronization; PR API was not retried. No model/ledger runs, login, credentials, production data or publishing operations.

## CI download-burst diagnosis and correction (2026-10-02)

`f0acf9c74a35e6504e65574ed5a72e1a8d9da6b3` is **not CI-accepted**: parent verified push 37036557523/job 110936097541 and PR 37036563999/job 110936120081 failed in URL E2E. Both passed 32 scanner/API tests. Push passed desktop then failed mobile; PR failed desktop. Both timed out at the 11th real download, retained() after the newest mocked response. The repo file is `prototype/public-audit/product-source-ui.e2e.mjs`.

Root cause confirmed by source and controlled real-browser experiment: [Chromium 145 LocalFrame](https://github.com/chromium/chromium/blob/145.0.7632.6/third_party/blink/renderer/core/frame/local_frame.cc#L3897-L3912) allows 10 downloads per burst and drops further requests until more than one second has elapsed. On the real fixture result page, 11 keyboard export activations in 49.37 ms produced only 10 download events. After 1100 ms, the same export button immediately produced the next download. The reproduction used installed Chromium 151.0.7922.173, which exhibits the same limiter. No app state changes or mocked download events were needed. The CI's Chromium 145 download attempt was blocked by CDN 403 Domain forbidden; no alternate source or access bypass was attempted.

Correction is test-only: all exports share one helper; after every ten completed downloads it allows at least 1100 ms from the last observed event before activating the next export (the source's one-second reset plus margin). No event timeout increase, retries, synthetic download success or removed content checks. Each viewport explicitly asserts **12 actual downloads**, preserving keyboard activation, complete JSON equality, snapshot/version/original-byte hash, cancelled/late response and last-success checks. Product UI/API behavior is unchanged.

Fresh local E2E after correction: **1280 PASS / 390 PASS**, 12 real downloads each, no remote/storage/errors/overflow, using the unchanged system Chromium override. `git diff --check` PASS. Existing 32 Python/API PASS evidence is unaffected by this test-only patch; new-head Chromium 145 CI remains for independent parent acceptance. This does not resolve storage capacity or change any production/publishing boundary.

## 狹窄 WooCommerce 產品歸屬切片

動機與 cloud 證據見[真頁品質評估增補](Public_Product_Quality_2026-10-02.md#父提供的受限-preview-觀察後續證據)。父的受限兩次 Preview 提交證實 UI／request／安全 fallback，未產生可用成果；snapshot 寫入數未知。修復前合成 WooCommerce fixture 無 preview（測試 FAIL），不以複製網站長文建立測試，也未追加 live requests。

新增 `woocommerce_single_product` 路徑只接受：單一 `main#main` 內 `div#product-N.product.type-product`，直接 `div.summary.entry-summary`，唯一直接 `h1.product_title.entry-title`，及直接 `div.woocommerce-product-details__short-description`。描述僅取明確區塊內直接段落；若有同產品 `div#tab-description`，其段落必須與短描述完全一致。缺短描述、巢狀異 scope／混雜段落、不同描述、缺 summary/title/root、多目標、結構化名稱衝突皆不生成 WooCommerce preview。沒有退回任意 main 首段。related／recommendations／shipping 等區塊排除；WooCommerce 一般 list 不抽為 features。原 microdata 路徑及安全 transport 保留。

正常支援頁可產出 title/meta/description，description 具兩個一致來源位置及產品名稱引用；`product_scope` 保留 root/name locator。結果新增 extraction.method／limitations，未解 scope 會明示 unresolved；這是來源陳述，不獨立核實，不宣稱支援所有 WooCommerce、所有 JSON-LD 或任意主題模板。短／長描述實際不同的常見頁型仍會安全降級。

驗證：**35 scanner/API tests PASS**。新增合成測試涵蓋無 microdata 正常单品、兩處一致描述、僅短描述、來源版本／引用、配送／推薦排除、內嵌異 scope、矛盾描述／JSON-LD 名稱、多產品及缺目標結構。一次測試誤將 missing 欄位名稱 `guarantees` 當成污染字串，已改為檢查完整合成污染句；未改產品輸出來迎合斷言。

**Fresh 1280/390 E2E PASS，各 13 次真下載**，新增 WooCommerce 本機 API→SQLite→parser→preview→keyboard Copy/Export，核對內容、方法、引用、來源版本与原 bytes hash；既有最後成功成果、取消／晚回覆與下載節奏斷言保留。`git diff --check` PASS。本機 Chromium 151；新 HEAD CI Chromium 145 待父獨立驗收。未登入、未 live POST／重抓指定域名、未模型呼叫或對外發布；未刪快照／改儲存架構。
