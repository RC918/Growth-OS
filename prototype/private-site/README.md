# 單站私有部署候選接線（未部署）

這一 slice 將既有靜態 UI、Python `handle_product`、Node publication host 與 WordPress/MariaDB 串成固定路由候選。沒有新增框架、Auth／SQL／授權實作或內容模板。repo 預設 UI/runtime 不變，只有獨立 gateway 啟動後產生候選 runtime/CSP。`config.example.json` 不可直接啟動：enabled=false、publishable key/page_id 未配置、activation=null。

## 固定路由

| Host／路由 | 接線與必要條件 |
|---|---|
| app Host，現有根層 `.html/.mjs/.css/.csv/.txt` | 固定 apps/web 資產集合；不提供 repo、目錄、credentials 或任意路徑。候選 CSP header 取代 HTML 內舊 CSP meta，connect-src 僅 self＋精確單一 Supabase origin。 |
| app Host，POST `/api/product-source` | 既有 Python loopback:8080；保留 app Host／Origin；丟棄 cookie、authorization、所有使用者 forwarding headers；4 KiB JSON。 |
| app Host，POST `/api/wordpress-publication/{7個既有action}` | 既有 Node loopback:8798；重寫 Host 為 listener，保留精確 app Origin/Bearer。需明確且未過期 activation；原 service 仍自行核 Auth、tenant、Review、短 write/read grants、journal。 |
| site Host，GET `/growth-os/`、`/about/`、`/privacy/`、`/robots.txt` | loopback:8082 WordPress。固定公開候選路徑，不送 cookie／Basic。三頁候選見 [theme](theme/README.md)，Privacy公開門檻未解，不得上線。 |
| site Host，GET/POST `/?rest_route=/wp/v2/pages/<page_id>&context=edit` | 精確一頁／固定 query，需 activation＋Basic；只轉送 Basic／x-growth-before，設定可信 x-forwarded-proto=https。WordPress 原 plugin 再核三欄／版／attempt與 read/write expiry。 |
| `/backend/*`、任意 API、其他 WP REST／admin／login／query | 拒絕；瀏覽器直接向明列 Supabase origin 送 publishable key＋user Bearer，gateway 不持有 service role、不代理 Auth 或任意 RPC。 |

Host／Origin／duplicate headers／encoded path／content encoding／absolute request-target 均拒絕；不重試、不跟 redirect。TLS 入口只 listen 127.0.0.1:8443，因此本候選沒有公網 listener。需要實際公開站時必須另審入口／TLS／DNS與防火牆配置，不能把 loopback 私有候選直接稱已公開可掃描。

## 配置與啟停（僅說明；本輪不在主機執行）

預先核定 immutable checkout 放 `/opt/growth-os`。模板採 Ubuntu 上明確 `/usr/bin/node`、`/usr/bin/python3`、`/usr/bin/docker`；安裝版本／實際 executable 路徑需部署時核對，不能直接照本環境 runtime 路徑。systemd template 本轮只作候選，未 daemon-reload／enable／start。

- `gateway.json`、TLS key/cert、publisher config/credential 都需 canonical 絕對路徑、owned、無 symlink/hardlink、0600、≤64 KiB。gateway 與 publisher 以 `growth-app` 執行；scanner 使用 `growth-source`。TLS certificate 與 app/site 的 SAN／期限需另外核實，不能關閉 TLS 驗證。
- config 的 Supabase allowed_origins 必须精確一項且與 origin 一致，拒絕舊 DB27 origin、wildcard 和非 publishable key。範例新專案 ref 不是對其 Data API／schema／grants 的啟用批准。
- `activation=null` 時 Save／Review schema flags 與 writers=false、publication=false；可先驗入口與公開 source route。配置宣告不是安全 authority：必須在另批 schema/RLS/RPC 權限實測完成後，才填 `{approval_reference,expires_at,save_review_rpcs:["review_url_result","save_url_result_draft"],publisher}`。UI flag 不授予 DB 權限，已開頁面不是權限撤除機制；撤權仍在 DB／service。每次 config module/API request 重查 expiry。
- publisher=true 時 gateway CLI 第三參數必須是 owned publisher host config；啟動前核相同 app/backend/key/page/site/listener 及 read grant。publisher 原 host config 包含穩定 binding、現有 private journal、獨立短 write/read grants；缺檔／store lock／錯權限應停止，不重建 store、不清 lock、不重新發 grant。
- 預備 `/srv/growth-private/{source,publisher,wordpress,mariadb}`。source/publisher 目錄0700，journal0600；WordPress/MariaDB volume UID 依 pinned image另核。Compose bind mount `create_host_path:false`，不隱式建目錄。磁碟／mount／初始化與 secret materialization 均不在本輪。
- `growth-private.target` 為手動 target，沒有 Install/開機 enable。Wants 四服務，gateway 在其後；publisher 未配置檔會 skip，closed config 啟動拒絕；入口仍須檢視各 service 狀態，target active 不代表所有上游 ready。無 automatic Restart，避免 crash lock 被重啟迴圈掩蓋。
- 批准後才可安裝 unit 並 `systemctl start growth-private.target`；stop target 透過 PartOf 先停 gateway，再停依賴。gateway／publisher SIGTERM drain 最多30秒，systemd 給40秒。restart 先完整 stop 再 start；gateway 是無狀態，publisher 重用原 journal。非正常退出保留 lock，需離線核對，不能 rm lock 自動修復。
- WP/MariaDB unit 使用 pinned 已有 image，`--pull never`、localhost唯一映射，不開 DB port。stop 只停止容器，保留 bind volume；不刪 DB、不 down -v、不 prune。需要事先安裝的正式 [theme](theme/README.md)/plugin、WP_HOME/SITEURL、唯一 page/admin/application password 另在批准包核定，沒有 fixture seeder 或固定身份。Docker Compose wait 不是 WP 頁面／授權 readiness 驗收。

HTTP header limit16KiB、32connections；requestTimeout15秒是**接收 request**期限，不是整個 handler 的總期限。gateway body 5秒、單次 upstream20秒/3MB、不重試；publisher 每次 HTTPS10秒，unknown 必須讀回原 operation。scanner 仍為 process-local、經代理共用 loopback IP 的10次/小時／2並行及100 snapshots cap；未改為多租戶限流。

## 隔離驗證

```sh
node --test prototype/private-site/gateway.test.mjs prototype/wordpress-pilot/host.test.mjs
node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --wiring
```

沿用原 rig/PGlite/Auth synthetic/session、短命 pinned WP/MariaDB與新 Node host，既有完整1280/390流程。測試入口用 candidate handler over loopback HTTP（不假稱 browser TLS驗收）；獨立契約啟動真正 TLS CLI child／驗 CA/SAN、固定Host、拒絕與SIGTERM/new PID重啟。Python HTTP test adapter只在 test-only file 注入 owned WP bytes transport，`handle_product`／scanner production 無localhost bypass。瀏覽器所有 Supabase origin 請求僅映射到原 isolated transport，沒有外網 fallback；不是新專案 Auth/DB 的 live 驗收。

## 後續精確批准包（尚未執行）

1. **目標與窗口**：僅既有 growth-os-pilot-vm 與新 Supabase wqepyttadrcnphtyjpjy，固定核准 commit/hash、私有驗證起訖、回復／收尾責任；不新建資源／升級套餐。舊 DB27 排除。
2. **主機存取與檔案**：核 host fingerprint，短命 SSH key、來源單一 IP/32與到期撤除；安装既有服務所需指定版本到明列目錄、建立服務 UID。不得公開22或把 secrets 帶入聊天／repo／logs。
3. **磁碟與備份**：先唯讀核 /dev/xvdf 身份與是否有資料，再獨立批准格式化／UUID mount；確認 volume owner/mode。明列 source cache、publisher journal、WP files/MariaDB及新Supabase backup/restore方案與演練；[共同恢復候選manifest](theme/recovery-manifest.json)尚未實作或驗證。未驗整台主機災復。
4. **新資料庫權限**：已交 [非RC schema/RLS及兩RPC精確grant候選](schema/README.md)與隔離native驗證；逐項另准安裝、實際帳號/membership、callback／SMTP與Data API開啟。這輪沒有 SQL migration/grant/真身份與 schema ready 宣稱。
5. **WordPress 與發布**：三頁正式模板候選見 [theme](theme/README.md)，另批真內容核稿；確認 public origin/page/plugin、最小 App Password 與 server-side file binding、write/read各自 deadline、一次publish/restore限額；不重用 test identity／RC global Product theme。
6. **網路／TLS**：app/site 精確DNS、SAN證書和公開或限制來源的listener規格另批；本候選loopback需批准的存取隧道才能私驗。真 scanner 的 public HTTPS/DNS限制不放寬，私有站不算公開來源或可搜尋站；開放搜尋另批。
7. **退出**：關閉activation、撤短grant／App Password／SSH授權與临时firewall規則，保留journal/DB和備份證據；stop服務，不刪付費資源。費用維持父批准資源上限，不擴配額。
