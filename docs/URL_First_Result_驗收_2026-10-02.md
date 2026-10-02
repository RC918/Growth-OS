# URL → Source Snapshot → First Useful Result 驗收

日期：2026-10-02（台北）。依[唯一藍圖 v2.0](AI_Company_Growth_OS_執行藍圖_v1.md)，本輪為新 M1 最小契約與 M2 預覽，沿用 public scanner；沒有新增 plan/work-card/對話 onboarding。

## 交付

首頁主要入口指向 `apps/web/first-result.html`。提交公開 HTTPS canonical URL → robots/DNS/實際連線/redirect 安全讀取 → Source Snapshot → Product Facts → 三項可複製文本。無法可靠辨識產品才要求選擇產品候選；失敗保留輸入。

快照包含 original/final URL、UTC fetched_at、SHA-256 content/version fingerprint、原始 bytes base64、解碼 HTML 與引用。引用有 snapshot_id/source_version/URL/locator/quote。SQLite insert 後完整讀回比對；重掃另建 ID、不覆寫舊快照。

Fact 僅表示來源陳述（source_asserted），不代表已獨立核實；產品類型與候選是 inference；缺失／未抽取資訊是 unknown。頁面 script 不執行；忽略無可见來源支持的 schema 價格等資訊。無模型、工具調用、secret 或權限操作。

預覽提供 title、meta description、產品描述的原文／建議、改善理由、逐項來源與待確認事實。採來源摘錄／重組規則，不宣稱 SEO 成效。Copy 以真正 clipboard API 操作；拒絕時提供選取文本。Export JSON 同時保留成果與完整來源。固定 awaiting_review/published=false，沒有發布操作。

## 驗收證據

`python3 -B -m unittest -v test_scanner.py test_app.py test_product_source.py test_product_api.py` 在 prototype/public-audit 執行：23 tests PASS。包含既有 scanner/app 回歸及新增 17 項測試。

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
