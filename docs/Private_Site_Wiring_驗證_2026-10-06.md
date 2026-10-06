# 單站私有部署候選接線驗證（2026-10-06）

父指定 Core：從已審 PR23 `566255f37aadb51ef72ae0f810659f610d9bf23b` 建立 `feat/private-site-wiring`，Draft PR base `feat/single-site-node-host`。使用者結果為同一入口可可靠接上來源、既有工作區與單站發布服務，且未配置權限時保持關閉；不是本輪開始公開站或部署驗收。CoreMilestoneProgress=1，Maintenance=0。

實作與[操作／精確批准包](../prototype/private-site/README.md)：Node 原生固定 TLS proxy/static handler、獨立新 Supabase origin/runtime/CSP、closed activation、systemd 啟停模板及 pinned WordPress/MariaDB bind-volume Compose。無套件／通用框架、非RC SQL、帳號、三頁正式theme、真grant或新模型配額。原 Node service/journal/unknown GET-only、Auth/RLS與 repo 預設 runtime 不變；15秒 requestTimeout 文件修正為接收期限。

## Agentic Verification Loop

| 點 | 適用性／結果／證據 |
|---|---|
| PLAN／CODE | 適用：補兩種不同 Host 契約的來源／publisher與站點固定代理，候選 allowlist 和啟停接線；新版權限仍由原 authority 核定。 |
| UNIT／CONTRACT | 適用：6 gateway＋7既有host契約 PASS。TLS exactHost/Origin/duplicate/路徑、缺配置／unsafe file／舊backend／wildcard／wrong key、expiry、source不帶秘密、publisher Bearer、WP固定頁／query/admin拒絕、真CLI啟停新PID、Compose只loopback且不隱式建volume。 |
| BUILD／RUN | 適用：Node CLI 實際TLS child start/stop/restart；E2E gateway handler真HTTP→Python product_api／Nodehost→gatewayWP route→短命官方WP/MariaDB。無build腳本，靜態app與原生Node/Python直接執行。Compose config成功；未啟動候選persistent Compose。 |
| BROWSER／DOM／1280＋390 | 適用：沿原入口新增 `--wiring`，兩尺寸完整UI、DOM、overflow、鍵盤與snapshot，實際來源報告經Python HTTP adapter產生。browser fixture gateway為loopback HTTP；TLS另由contract驗，無真HTTPS browser／部署宣稱。 |
| DATABASE／AUTH | 適用：原native PG17六案＋PGlite短命synthetic角色/session；新Supabase網址只作精確邏輯destination，由runner映射原隔離authority，禁止外網fallback。真正新專案JWT/OTP/SMTP/SQL schema/DataAPI NOT RUN。 |
| SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK | 適用：完整來源／Unicode編輯payload保存，舊context關閉、舊token退役、全新context/token，精確v1及Review讀回、v2不沿用v1核准。不是正式Auth engine或郵件登入證據。 |
| TENANT／PERMISSION | 適用：viewer read/no-write、foreign OrgA read/write拒絕，SQL/journal零增量；gateway closed／expiry與host錯誤零upstream；publisher到期／revoked、唯讀history、unknown原operation GET-only保留。 |
| PUBLISH／MEASURE／RESTART | 適用：每viewport2次WP POST（一次publish＋一次restore），lost reply後不重送；service及driver退出、新PID與fresh token讀回exact history/GSC；read lease到期前置拒絕；control頁不變。原fixture broker/SQL/site仍活著，非整台主機災復。 |
| VERIFY／Reviewer | 本機驗證與資料包如下；提交後以PR的exact HEAD CI logs／Preview身份交既有Reviewer。Primary不自行APPROVE，Reviewer決定驗收，父決定下一slice。 |

## 可重現命令與證據

```sh
node --test prototype/private-site/gateway.test.mjs prototype/wordpress-pilot/host.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --wiring
docker compose -f prototype/private-site/templates/wordpress.compose.yml config --quiet
git diff --check
```

[完整log／雙尺寸proof與SHA256](evidence/Private_Site_Wiring_2026-10-06/SHA256.json)。只收非秘密proof與畫面，不提交fixture configs、keys、tokens、DB檔。新CI步驟沿既有無人值守入口；更新CI入口數量契約為原4 modes＋wiring，未放寬production import isolation。

本機過程中的失敗已分類：Playwright預設下載位置缺browser，採既有 `/usr/bin/chromium` 支援設定；test TLS fixture需app/site SAN及固定SNI；test mode0600受umask影響，負測顯式chmod0644；HTTP fixture需原生request保留Host；新增CI mode令原計數5→6（含split起始段），精確更新allowlist。均為本Core必要測試接線，沒有改 TLS trust規則、產品Auth／SQL或production scanner。

`systemd-analyze verify` 在此非systemd主機容器回報 `/usr/bin/node`、`/usr/bin/docker`不存在以及 `docker.service`不存在；實際環境二進位在工具runtime／usr/local。模板對目標Ubuntu的路徑與unit依赖需部署時核對；不將這一命令列為PASS，也未安装／reload／start systemd。契約涵蓋模板期限／權限與Compose解析；真正主機啟停與4GB容量尚未驗收。

## Deferred／邊界

- **P3：proxy後source limiter共用loopback IP**，位置既有product_api/README，本版routing契約及兩viewport證據確認。使用者影響為單站測試共享10次/小時，並非多使用者限流；本Core為單站私有candidate，限額安全保留且不阻塞，未加持久rate store。觸發：公開或多使用者啟用前；追蹤：待父指派。
- **P3：完整主機啟停、crash離線核對、4GB容量與整站backup/restore**，本版只測Node child lifecycle及原readonly journal restore，模板未上主機；不影響repo候選交審，不能據此正式啟用。觸發：部署批准前preflight，追蹤：待父指派。
- **Deferred vertical slice：非RC schema/RLS/RPC清單與三頁正式theme**，父明確允許拆出；目前不得借RC fixture身份或global Product theme安裝。不把其缺失偽稱可直接開DataAPI／發布站。下一Core由父選定。

這輪沒有AWS/Supabase部署、網路規則、持久grant、磁碟格式化、DataAPI啟用、舊DB27變更、真URL／模型消耗或費用。上個獨立ACL修正的證據不作這輪部署或權限批准。
