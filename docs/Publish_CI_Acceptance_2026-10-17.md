# Publish 免 Docker 真實驗收紀錄（2026-10-17，GitHub Actions Runner）

## 結論

`PUBLISH_CI_ACCEPTANCE_PASS`：Publish 已在 GitHub Actions Runner 內以臨時
WordPress 6.8.3 / MariaDB 11.4.8 完成真實 HTTPS 發布與讀回。未要求 Owner
安裝 Docker，未使用正式網站憑證，未新增付費服務，臨時環境已銷毀。
證據來源為 PR #31 Commit `523dde1b94acd837acda0066da2a64359201dc74` 的兩次
CI 執行 `39049315795`（16m17s）與 `39049319224`（20m42s），皆為 `test` PASS。

## 實際執行證據（CI 日誌原文摘要）

- `PASS official local WordPress 6.8.3 / MariaDB ... loopback only`
- `PASS real WordPress empty/explicit excerpt: lost response → SIGKILL/new process → original ID GET-only → API/HTML confirmed → restore; 2 POST; control1002 full page/meta equal`
- `PASS WordPress 1280px/390px: real HTTPS App Password → current diff → separate confirmation → API+HTML → fresh-session exact publication/measurement → verified restore; 4 writes (2 publish + 2 restore)`
- `PASS WordPress stale reviewed version denied`（未以當前核准版本發布被拒）
- `PASS WordPress short lease expiry and native Application Password revocation; restarted service + fresh synthetic token denied both; no page changes`
- `PASS WordPress cleanup: exact run containers removed; tmpfs DB/site/credentials and local TLS key removed; no prune`

對應 Owner 四項要求：未核准不得發布 PASS；核准後發布成功 PASS；HTTP GET
（REST + HTML）讀回一致 PASS；授權過期/撤銷不得寫入 PASS。CI 日誌已掃描，
未發現密碼、Basic 憑證、Token 或金鑰模式。

## 機制（重用既有資產，未新開發布器）

`.github/workflows/python-tests.yml` 既有步驟先 pull 兩個 pinned 映像，
再執行 `prototype/wordpress-publish/excerpt-regression.mjs`、
`prototype/owner-workspace/auth-session-regression.e2e.mjs --wordpress` 與
單站 pilot 驗證；站台由 `prototype/wordpress-publish/site.mjs` 建立，
授權為最長 900 秒、固定 page/欄位 allowlist 的一次性 Application Password，
結束即 `docker rm` 與 tmpfs 銷毀。此流程原本即隨每次 CI 執行，本紀錄將其
正式認定為 Publish 真實驗收證據，不另建測試站或治理文件。

## 尚未完成（不得以本次結果替代）

- 瀏覽器以真實登入操作受控 Preview 的端到端驗收：CI 內已有 1280/390
  瀏覽器全流程（URL→成果→Save→fresh session→Review→Publish→Measure），
  但使用合成工作階段且日誌明載 `no live URL/Auth`；Preview 受 Vercel SSO
  保護，W1 原始登入問題仍為 HUMAN_REQUIRED。
- 對任何託管/正式 WordPress 站的發布：未授權、未執行。
- 真實 GSC 成效：未連接，標示「追蹤中」。
