# W1 登入動態 import 失敗｜最小診斷證據 2026-10-16

原則：只蒐集能區分失敗類別的最小證據，不猜根因、不含 Secret/Token/信箱。

## 已取得（離線、合成、本機）
- 部署包 `delivery/w1-private/dist` 15 檔與 `SHA256.json` 雜湊全數一致（上輪核對）。
- 入口 `w1-workspace-entry.js`（classic script，`defer`）動態 `import('./product-fact.mjs')`；自入口可達模組圖完整（`module-graph.test.mjs` PASS），無缺檔。
- 入口只輸出固定分類：MODULE_LOAD / MODULE_SYNTAX / MODULE_REFERENCE / MODULE_EXECUTION / INIT，不輸出原始錯誤、URL 或憑證。
- 部署 HTML 的 CSP 為 `script-src 'self'`、`default-src 'none'`；設定檔為 CLOSED 預設（key/redirectOrigin 為 null），live 行為不得由離線 PASS 推定。

## 尚缺（須原 Mac / 經核准 live 唯讀取得，缺一不可判因）
1. 失敗當下 `#auth-status` 完整文字（含錯誤分類）與瀏覽器名稱/版本。
2. 部署後實際 HTML 原始 bytes 與其 SHA256（平台可能插入內容）。
3. 入口與 `product-fact.mjs` 兩個請求的 HTTP status 與 Content-Type（不需 headers 全文、不要 Cookie/Authorization）。
4. 失敗時間（UTC）與站台版本（Site v11 等），對照 repo commit。

## 禁止事項
不重送登入信、不換 route/代理/IP、不貼 Token 或 magic link、不以離線 PASS 宣稱 live 已修復。
