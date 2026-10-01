# Growth OS M1 目標與問答保存驗收

2026 年 9 月 30 日。目前狀態為「獨立測試環境已部署，自動驗收通過，真實 owner 保存／讀回及 viewer 介面驗收通過，PT409 遠端先後版本衝突驗收通過；DB 交易重疊與完整 M1 放行仍未完成」。下列本機測試表保存最初驗收時的結果；恢復部署後的結果見文末。本文件只記錄實作與驗收證據，產品需求及路線圖仍以 [執行藍圖](AI_Company_Growth_OS_執行藍圖_v1.md) 為準。

## 實作範圍

在現有工作台新增逐步引導區，不全面重寫介面。保留使用者原始目標，再收集推廣內容、受眾、市場與語言、流量渠道、網站／連結及觀察指標。沒有連結可以回答「尚無連結」。固定引導明示未接入 AI，不從原話猜測事實；確認資料後顯示「待建立成長計畫」。

新 migration 由 Supabase CLI 建立為 `20260930112010_growth_goal_intake.sql`，新增 `growth_goals` 和 `growth_goal_turns`。本機實作階段尚未套用遠端；恢復部署後已套用至隔離測試 Supabase，詳見文末。每次回答／修正新增版本，保留原話與伺服器問題；修正取消既有確認，需再次確認。歷史版本無直接客戶端更新或刪除權限。

owner 保存透過 public invoker／private definer RPC，私有交易每次依目前成員關係檢查權限。Authenticated 只能讀取有成員資格的工作區；viewer 可讀不可寫；anon 無資料讀取或 RPC 權限。RPC 使用 request_id 去重、expected_version 拒絕過期寫入，與 audit_events 同交易。組織鎖序列化同組織寫入；真正多人並行仍待驗收。

API 依已確認的登入成員設定 organization_id。對話內容只以 textContent 顯示；沒有本機持久憑證或私密問答快取。重新登入後由資料庫讀回；登出清除畫面及待提交內容，延遲回應不得恢復前一工作階段。尚未提交的文字不承諾跨登入保存；HTTP 401 提示重新登入。

## 本機階段測試結果（歷史紀錄）

| 檢查 | 結果 | 證據與限制 |
|---|---|---|
| Node 資料與 API 回歸 | 21 項通過 | 既有 workspace API 與搜尋基線契約 |
| 新引導與 API | 4 項通過 | 無網站、確認、修正、順序驗證、API 組織範圍與 viewer 拒絕 |
| DOM 操作 | 1 項通過 | 不確定保存結果重試、跨工作階段讀回、不可覆寫修正、確認失效、延遲回應及 viewer 唯讀；不代表瀏覽器排版通過 |
| PostgreSQL WASM 引擎 | 9 組通過 | 所有 migrations 編譯、去重／不同 payload 拒絕、輸入與順序、版本衝突、直接寫入拒絕、同租戶 viewer 讀取、跨租戶讀寫拒絕、anon 拒絕及權限撤銷；auth.uid() 為合成 claims；僅排除早期 pgcrypto extension 安裝 |
| 原有 Python migration 靜態契約 | 8 項通過 | 原有 guardrails；不能取代新增 SQL 的實際執行測試 |
| 原生 PostgreSQL | 未完成 | 現有 Homebrew 路徑缺失，暫存測試副本修正後仍受沙箱 shmget 限制；未修改系統安裝或遠端資料庫 |
| 桌面／手機 Chromium | 未完成 | 已準備 1280／390px 流程測試，但 Chromium 啟動遭 macOS MachPort／Crashpad 沙箱限制，沒有取得畫面或宣告 E2E 通過 |
| 遠端 Supabase 真實登入／Data API | 未執行 | 新 migration 與程式未部署；既有 owner 觀測保存證據不替代新功能驗收 |

## 重現方式

開發測試依賴固定版本並保存 lockfile；它們不進入靜態產品的執行期。`npm ci --ignore-scripts` 後執行：

```bash
node --test prototype/owner-workspace/workspace-api.test.mjs prototype/csv-import/search-baseline.test.mjs prototype/owner-workspace/goal-intake.test.mjs prototype/owner-workspace/goal-panel.test.mjs
node supabase/tests/goal_intake_postgres.mjs
python3 -m unittest discover -s supabase -p test_migration_contract.py -v
node prototype/owner-workspace/goal-intake-ui.e2e.mjs
```

最後一項須有可啟動的 Playwright Chromium。本機啟動受沙箱限制；恢復部署後已由 Linux CI 執行並通過，對應提交與結果見文末。

## 待驗收與範圍護欄

隔離 Supabase schema 套用、SQL 權限／撤銷會員驗收與 CI 桌面／手機合成流程已完成。M1 放行前仍需使用真實登入驗證 owner 保存與重新讀取、viewer／跨工作區 API 拒絕、401 後恢復，以及真正獨立資料庫連線的多人並行。SQL 合成 claims 與瀏覽器合成 transport 不替代上述證據。

M2 計畫／工作卡、AI 理解與產稿、發布、真實成長資料仍未實作。現有企業資料核准不能被目標確認取代。保留 profile／機會／內容版本／審核／行動計畫／觀測功能與過去資料。本輪不改 morningai、owner-console、正式網域或付費設定。

## 技術參考

核對 [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[資料庫函式](https://supabase.com/docs/guides/database/functions) 與 [變更紀錄](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)。本機 SQL 檢查依 [PGlite API](https://pglite.dev/docs/api) 執行；該結果只代表此 PostgreSQL 引擎與合成權限情境，不宣稱遠端服務已部署或驗收。

## 恢復部署後的驗收進度

使用者於 2026-09-30 明確允許恢復 Growth OS 測試部署與驗收。應用提交 `a9d0c25aa47d0c530720ded07323a163416599ee` 已在 Vercel Preview Ready；後續提交 `30325ef5755084087150e8d46e466f3c8b7b57a3` 修正測試登入 helper 並加入遠端 SQL 驗收，不更改 apps/web。

初次 CI 的引導 E2E 在第二次登入失敗：同網址只變更 hash，沒有重新載入 acceptRedirect。測試加入不同 test_session query 後，[PR CI](https://github.com/RC918/Growth-OS/actions/runs/36711308913) 與 [push CI](https://github.com/RC918/Growth-OS/actions/runs/36711300665) 均成功；1280／390px 完成問答、未知連結、確認、跨載入讀回、修正保留、viewer 與延遲回應驗收。此層使用合成 Auth/Data transport，不能視為真實 JWT 證據。

新 migration 已在隔離 Supabase 套用成功。`goal_intake_staging.sql` 以既有測試使用者和合成 JWT claims，在同一交易建立測試組織／目標，驗證 owner 保存、重試、版本、審核事件、同組織 viewer 讀取、viewer／其他工作區拒絕、成員撤銷、anon／直接寫入拒絕，最後 rollback。回傳 PASS；確認回滾後新目標筆數為 0。資料庫授權查詢確認 authenticated 只有 SELECT，anon 無新表授權。Security Advisor 沒有新表 RLS／RPC 警告；現有 leaked-password protection 警告未改動，本工作流使用 Magic Link。

真實新版登入與 API 驗收仍待精確 callback URL 的確認，未將新設計或合成檢查寫成真實驗收已完成。預設 Site URL 不變；沒有正式網域或付費設定變更。

## 中斷恢復與無需真人的核對

2026-09-30 再次核對分支 `feat/passwordless-workspace`，應用與測試提交為 `30325ef`。其與 `a9d0c25` 的 `apps/web` 差異為空；沒有重做功能、migration 或部署。唯讀遠端檢查確認目標與問答各 0 筆、兩張表 RLS 啟用、authenticated 的 SELECT 授權各 1 項，anon／authenticated 的 INSERT、UPDATE、DELETE 授權合計 0 項。部署來源 bundle 的完整歷史驗證通過。

不依賴真人的本階段核對完成。待處理的精確登入返回網址仍為 `https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html`；未新增授權、變更 Site URL 或重新要求使用者手動登入。M2 與全面介面改寫保持待開發，不因本階段核對完成而標記 M1 全面放行。

## 真實帳號驗收與本機修正

2026-09-30 台北時間約 21:11–21:20，接獲監督任務轉交的使用者精確網址批准及保存結果。設定頁實際讀回確認共 13 個 Redirect URLs，包含 a0rpg9s0x 的 workspace.html，原 12 個保留，Site URL 仍為 ny0422g6e。沒有重複新增或變更預設網址。

使用既有 owner 帳號的最新一次性郵件，於已部署 a9d0c25 頁面完成真實 Supabase Auth 登入，新增合成驗收目標 `5055ca31-40cc-435d-9f52-cdf19166440c`（Fixture A）。目標、六項回答與確認保存成功；無網站可繼續，確認只顯示待建立成長計畫。修正受眾新增第 9 筆歷史，原答案保留且先前確認失效。登出後工作台清除，再用第二封新郵件登入，從伺服器讀回相同 ID、修正版與九筆歷史；重新讀取按鈕亦成功。在 390px 手機寬度完成再次確認；DOM 讀回 viewport 390、document scrollWidth 375，沒有水平溢出。最終資料庫核對為 10 筆問答與 10 筆 goal_turn_saved 審核事件，最新題目為 confirm。驗收資料保留供後續檢查，沒有刪除既有資料。

既有 viewer 帳號真實登入 Fixture B，新目標區沒有 Fixture A 的目標、沒有目標表單或新增／修正控制。既有診斷回傳跨組織 organizations 讀取無資料、review_growth_opportunity RPC HTTP 403。此診斷未呼叫 save_goal_turn，不能宣稱新問答 RPC 的真實 viewer／跨租戶拒絕已驗收；該 RPC 現有證據仍為遠端 SQL 合成 claims 與本機契約。

真實操作發現初次 open() 完成後提示仍為「讀取或保存中」。本機修正為讀取完成時顯示保存資料或空工作區，保留失敗提示與跨工作階段保護。同步 apps/web 與 prototype 檔案；DOM 回歸新增空清單、保存目標、HTTP 401 提示及重新 open 恢復檢查，26 項 Node 測試全數通過。此修正尚未部署；401 檢查使用合成 API 錯誤，不能視為真實 JWT 逾時驗收。

證據保存於聊天 outputs：Growth-OS-M1-real-owner-confirmed.jpg、Growth-OS-M1-real-owner-history.jpg、Growth-OS-M1-real-owner-readback.jpg、Growth-OS-M1-real-owner-mobile.jpg、Growth-OS-M1-real-viewer-isolation.jpg。沒有保存登入 token 或郵件連結到驗收文件。

剩餘完整放行條件：新 save_goal_turn 的真實 viewer／跨工作區 API 拒絕、真實 401 後重新登入恢復、獨立連線多人並行，以及本機提示修正部署後驗收。本輪未新增部署或合併；未擴展 M2、其他專案、正式網域或付費設定。

### 遠端雙連線探測的限制

兩個回滾交易分別以 backend_pid 295694、295697 執行，同一目標 expected_version=10 的合成 RPC 探測均回傳第 11 版，最後各自 rollback。未觀察到 lock_timeout 或版本衝突，故只能確認獨立後端與回滾，不能證明請求重疊或鎖競爭成功。後續唯讀核對仍為版本 10、10 筆問答與 10 筆審核事件，測試無殘留。查詢與結果摘要保存於 outputs/Growth-OS-M1-concurrency-probes.json；並行驗收維持待完成。需要可控制交易交錯的資料庫連線或適當 API 驗收入口，不能把 MCP 呼叫同時發送當成資料庫同時執行。

本輪來源已保存於本機，沒有推送、合併或新增部署。真實登入測試結束後已退出 owner／viewer 分頁工作階段，精確新版工作台保留開啟。

## 剩餘直接 API 驗收的明確結果

2026-09-30 接續剩餘驗收，郵件連接器已可讀取最新測試郵件。新增 `supabase/tests/goal_intake_real_auth.mjs`，一次性連結與 token 只留記憶體、不輸出或寫入結果檔。runner 的 PTY 輸入需不回顯；初次普通 stdin 已關閉與同步錯誤誤用 assert.rejects 均屬 runner 問題，已修正。請求加 30 秒時限，失敗結果保留安全摘要。

| 剩餘項目 | 明確結果 | 證據／限制 |
|---|---|---|
| 新 save_goal_turn 真實 viewer／跨租戶拒絕 | 通過 | 新 Auth 的 viewer 對 Fixture B、viewer 對 Fixture A、owner 對 Fixture B 均為 HTTP 403／42501；新兩張表跨租戶讀取均為空。探測使用無效 question_key，即使授權回歸也不應寫入。遠端 edge logs 有對應三次 403。 |
| 真實 HTTP 401 後恢復 | 通過（API 層） | 故意破壞 JWT 簽章，真實 Data API 回傳 401；真實 Auth 驗證失敗後清除記憶體工作區，再驗證有效 Auth 後讀回已保存資料。這不是等待 token 自然到期，也不是瀏覽器逾時流程驗收。 |
| 重疊 API 保存 | 失敗 | 兩次各有一筆合成修正保存，競爭請求第一次回應不能解析 JSON，第二次超過 30 秒。edge logs 確認一次 HTTP 504／text/plain；postgres logs 的 save_goal_turn 相關 40001 在 13:57:18–14:03:22 UTC 有 36,493 筆、2 個後端。不能把 HTTP 同時送出當成 DB 交易重疊通過。 |

唯讀核對本目標現為 12 筆問答、12 筆審核事件；原 10 筆沒有覆寫或刪除，新增兩筆都是清楚標示的合成受眾修正。最新資料因此尚未再次確認，不代表發布或成長。沒有重新執行已通過的 owner 介面驗收。

版本衝突目前用 40001（serialization_failure）回報。官方 [PostgREST 錯誤映射](https://docs.postgrest.org/en/stable/references/errors.html) 將 40* 對應 500，PT409 才明確指定 409；既有 runner 把 40001 預期成 409 的假設已更正。根據大量重複錯誤與最後 504，推斷服務對此交易錯誤持續重試；沒有調低遠端保護或重試設定。

已由 CLI 建立本機 migration `20260930140406_growth_goal_conflict_http.sql`：public RPC 保留 security invoker、空 search_path、既有參數及授權，將 serialization_failure 轉為 PT409；原 private 寫入與權限檢查不變。PostgreSQL WASM 的 9 組實際 SQL 與 8 項 Python 契約均通過，runner 語法檢查通過；後續 SQL／真實 API runner 已改成 PT409 契約。修正未套用遠端，沒有推送、合併或新增部署。

具體阻礙與最小下一步：新 RPC 權限與 API 401 恢復已不缺憑證或授權。並行驗收受目前部署版本的 40001／504 問題阻擋；須解除本輪禁止新部署／遠端變更的限制後，只將上述修正套用 Growth OS 測試 Supabase，再執行 runner 的 --concurrency-only，要求有時限內一筆成功、一筆 PT409／HTTP 409，且僅新增一筆歷史。若要求精確證明 DB 交易重疊，還需可控制 BEGIN／鎖屏障的兩條受限資料庫連線；MCP 兩次呼叫與 HTTP 起訖時間不足以證明該條件。無需提供密碼來重做已完成的測試。

安全摘要保存在 outputs/Growth-OS-M1-direct-api-checkpoint.json；401 的逐項通過紀錄在 Growth-OS-M1-remaining-api-results.json，並行失敗紀錄在 Growth-OS-M1-concurrent-api-results.json。M1 保持未全面放行。

## PT409 精確遠端修正與驗收（目前結果）

2026-09-30 台北時間約 22:16–22:20，依使用者精確批准，只將 `20260930140406_growth_goal_conflict_http.sql` 套用隔離 Supabase `vhzryhibmpvglzcmfnaa`。遠端 migration 紀錄為 `20260930141637`／`growth_goal_conflict_http`。沒有推送、合併、Vercel 部署或其他專案／權限變更。

套用前保存 public 原函式定義、prosecdef=false、空 search_path、postgres 擁有者及 ACL；private 定義 MD5 為 `789ebc9f0903f57ef4b4fb793437590b`，其 ACL 亦保存。套用後逐項比對上述屬性、private 定義與 ACL 均相同。只將 public wrapper 改為 PL/pgSQL，以 PT409 轉譯 serialization_failure，private 授權及寫入邏輯不變。DDL 前後目標十二筆歷史 MD5 均為 `483e22b0d560fb83b7e1a7f9810bfffb`。Security Advisor 沒有新增函式／RLS 警告；僅原有 [密碼洩漏保護提示](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)，未改設定。

只執行 runner 的 `--sequential-conflict-only`，不重跑 owner 介面、權限拒絕或 401 驗收。用新的一次性郵件在記憶體取得既有 owner 的真實 Auth：

| 呼叫 | 結果 | 耗時 | 保存效果 |
|---|---|---|---|
| 首筆，expected_version=12 | HTTP 200 | 222.83ms | 新增第 13 筆合成受眾修正 |
| 第二筆，仍 expected_version=12 | HTTP 409／PT409 | 267.96ms | 無新增、無覆寫，保留首筆答案 |

runner 明確驗證第一筆完成後才送第二筆、第二筆小於 10 秒、前十二筆深度相同、成功的新答案保留。資料庫另核對版本 13、13 筆問答、13 筆 goal_turn_saved 審核事件；原十二筆 MD5 未變。最新為受眾修正，尚未再次確認，沒有追加與此次目標無關的確認或功能資料。

14:18:00–14:20:04 UTC 的遠端日誌僅有 save_goal_turn 一次 HTTP 200、一次 HTTP 409、一次 PT409；沒有 40001 重複或 504。故本次「正常保存 → 舊版本快速拒絕 → 不覆寫與審核一致」精確里程碑通過。這是先後呼叫，沒有宣稱 PostgreSQL 交易重疊已驗證。

安全證據在聊天 outputs：Growth-OS-PT409-before.json、Growth-OS-PT409-after.json、Growth-OS-PT409-real-api-results.json、Growth-OS-PT409-verified-history.json、Growth-OS-PT409-logs.json。無登入連結或 token。新增 runner 先後模式與文件保存於本機，沒有推送。

回復方式：原 public 定義保存於 outputs/Growth-OS-PT409-restore-public-function.sql（僅參考，未執行）。若必要，在確認目標及目前 ACL 仍匹配後，以後續補償 migration 的 CREATE OR REPLACE 恢復該原定義；保留擁有者、security invoker、空 search_path 及原 ACL，不刪除 migration 歷史、不回退問答或審核資料。此恢復會帶回 40001／重試問題，不能當成已批准自動回退。

仍未完成：可證實的獨立 DB 交易重疊需兩條可控制 BEGIN／鎖屏障的受限資料庫連線；先後 API 成功不能替代。自然 JWT 到期的瀏覽器恢復未驗收；先前 401 證據為 API 層無效簽章。初次讀取提示本機修正尚未部署。M1 全面放行及 M2／AI 理解／成長計畫仍未宣告完成。


## M1 接續檢查點：Preview 與剩餘驗收（2026-09-30 23:02）

本節為目前狀態；先前「未推送／未部署」敘述保留作為當輪歷史。

- `feat/passwordless-workspace` 的既有修正已推送至 `6974fc1ad678c683e47e6ea38069b60e1445d883`。Vercel 確認 Ready、Environment=Preview、來源 SHA 相同；網址為 https://growth-os-preview-8uzbiadhu-morning-ai.vercel.app/workspace.html 。初次讀取提示修正已隨此版本部署，登入後真實 UI 驗收仍待該確切 callback 的單項批准，不能以部署成功代替。
- 該 SHA 的 CI 兩次均成功：[36732622565](https://github.com/RC918/Growth-OS/actions/runs/36732622565)、[36732614466](https://github.com/RC918/Growth-OS/actions/runs/36732614466)。未合併 PR，未改正式網域、付費或其他專案。
- 自然 JWT 到期驗收已在既有批准的 a0rpg9s0x 工作台建立 owner 工作階段，讀回 13 筆歷史。實際 expires_at=1790784114，即 2026-09-30 16:01:54 UTC／10 月 1 日 00:01:54 台北；安全接續時間為 16:02:54 UTC／00:02:54。分頁 ID 1385706650 已保留交接。不可刷新、關閉或先登出；到時點「重新讀取目標」，觀察自然 401／登入逾時提示，再用既有帳號的新郵件重新登入並讀回同一目標與 13 筆歷史。這項尚未通過，沒有變更 JWT 到期設定。安全摘要僅保存時間與分頁 ID，不含 token。
- DB 交易重疊屏障探測未通過：holder PID 301844 鎖持有於 14:52:18.036901–14:52:30.050577 UTC；contender PID 301847 在 14:52:34.873647 才開始，14:52:34.913918 結束；observer 14:52:39.659699 的活動交易清單為空。不同 PID 不代表同時交易；三筆交易均 rollback，無保存資料。現有 execute_sql 入口未提供可控制的同時連線，重跑同一工具不補足證據。所需能力為兩條可同步 BEGIN／鎖屏障的受限獨立 SQL 連線及一條 pg_stat_activity／pg_blocking_pids 觀测連線；未新增 login、授權或擷取秘密。

證據在聊天 outputs：Growth-OS-6974fc1-preview-ready.jpg、Growth-OS-M1-lock-barrier-tool-gap.json、Growth-OS-natural-expiry-session.json。PT409 先後保存與快速拒絕、權限拒絕及 API 401 已通過，未重跑。M1 仍待自然到期、真實 DB 重疊及新版登入讀取提示驗收；M2／AI 理解與成長計畫未寫成已完成。


### 受限直連能力調查：唯讀結論

2026-09-30 23:06 左右完成唯讀調查。repo 中未找到 DATABASE_URL／DIRECT_URL／PGHOST 等直連設定引用或 env 檔；目前終端環境也沒有這些連線變數（只查是否存在，沒有輸出值）。psql 已安裝，但客戶端存在不代表已有連線憑證。可用 Supabase 連接器沒有獨立連線／交易 handle 接口。

pg_roles 唯讀結果只有 Supabase 標準角色，沒有專案專用的受限測試 LOGIN。authenticated、service_role 均 NOLOGIN；authenticator 為 LOGIN，但它是服務角色，沒有已提供／已授權使用的密碼，不能擷取其秘密或借用。postgres 與若干管理角色有 BYPASSRLS 或更大權限；不能替代驗收使用者權限。先前假設 authenticator 不可登入應以本次 rolcanlogin=true 的實測為準，仍不代表已有可用憑證。

因此目前沒有已確認適合且已授權的受限直連，停止猜測連線或重新跑同一序列化 MCP 屏障。service_role API key 不等於 Postgres LOGIN 密碼；其 BYPASSRLS 也無法證明 owner／viewer 隔離，HTTP 請求更不能持有可控制的 SQL 交易。管理員連線即使 SET ROLE 也仍提供超出驗收需要的能力，不能作為無授權的捷徑。

最小需求（提案，未建立／未授權）：

1. 使用本隔離測試專案的既有適合受限 LOGIN，若不存在則另經精確批准設計短期驗收角色。要求 NOSUPERUSER、NOBYPASSRLS、NOCREATEROLE、NOCREATEDB，僅 CONNECT 與必要 schema USAGE／RPC EXECUTE／受限讀取。必須限制為指定 Fixture A 的合成目標，不授予直接表 INSERT／UPDATE／DELETE、服務角色或管理員角色。單純 GRANT authenticated 並允許任意 JWT claims 不是充分的租戶限制；角色與現有 RLS／函式的相容性及固定 fixture 限制須先審核。
2. 同一受限角色開兩條交易連線，第三條只觀測這個角色自己的測試 session PID／lock blocker。優先使用本角色 session 可見性，不預先授予 pg_monitor／pg_read_all_stats。連線端點與 username 從專案 Connect 頁取得，TLS 驗證保持；密碼只透過安全輸入留記憶體，不寫入 repo、命令參數、日誌或文件。IPv6 可用時直連；IPv4 可用既有 session pooler，不購買 IPv4 add-on。[官方連線方式](https://supabase.com/docs/guides/database/connecting-to-postgres)、[官方角色說明](https://supabase.com/docs/guides/database/postgres/roles)。
3. 真正屏障流程：A BEGIN 後對指定合成目標呼叫 RPC，持有未提交的鎖；B 在 A 未釋放前 BEGIN 並呼叫相同目標 RPC；C 證明 A／B PID 不同、B wait_event 為 Lock 且 pg_blocking_pids 包含 A，記錄重疊時間；A ROLLBACK 後 B 完成並 ROLLBACK。所有測試有 lock_timeout／statement_timeout，最後核對原 13 筆历史與審核完整。此流程驗證實際鎖等待，PT409 舊版本拒絕則引用已通過的獨立證據，不混寫成同一測試。

回復方式（須與角色批准一起審閱）：正常或失敗均回滾尚未完成的交易、关闭三條測試連線；只針對該短期測試角色撤回此次授權並取消 LOGIN／到期資格，確認無活躍連線及無擁有物件後才按核准方式移除角色。既有帳號、RLS、callback、資料與 migration 不回退；不得輪替共享 postgres／authenticator 密碼。尚未執行任何角色／授權／callback／域名／路由變更。

協調更新：固定測試分支 alias `https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html` 已在 Vercel Domains 唯讀確認存在；它會跟隨未來分支 build。callback 決策待回應，不新增任何 URL／路由；若固定 alias 獲精確批准，取代尚未執行的 8uz 臨時網址请求，兩者不可同時執行。`project-c7ksn.vercel.app` 標記為 Production，不作測試替代。


## 固定測試網址與讀取提示：通過

使用者當次批准固定分支 alias，已只新增 `https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html`。保存後重新載入 Supabase URL Configuration，驗證共 14 項、原 13 項逐項保留、Site URL 相同、僅增加該固定 alias，沒有萬用字或 8uz 臨時網址。安全前後摘要與截圖在 outputs/Growth-OS-fixed-alias-callback.json／.jpg。

原臨時網址批准請求 `call_LrBA8pNNvDqgUuuRkoXRR2Nw` 標記 **superseded／不可執行**，由固定 alias 的精確批准取代。工具查找未提供撤销提問入口，故以此記錄消除舊請求執行效力，不建立第二份提問。

固定 alias 現對應 Ready Preview 6974fc1。另開分頁、既有 owner 測試帳號真實郵件登入後，首次讀取即顯示「已讀取保存的目標與問答。」並讀回指定目標 13 筆歷史。只驗收提示，未重跑保存或權限 PASS、未新增問答。截圖 outputs/Growth-OS-fixed-alias-read-status.jpg。額外登入分頁已退出，固定工作台保留開啟；自然到期分頁 1385706650 未刷新或登出且重新標記交接。

### 精確受限直連方案：安全審核草案，未套用

驗收命題僅是「遠端現版 RPC 的組織列鎖確實使第二個獨立交易等待，rollback 後可繼續，沒有遺失／覆寫歷史」；不是重做已 PASS 的權限、自然到期或 PT409 先後呼叫。現 MCP 的實測時間證明序列化，不能作此命題證據。

唯讀查證：兩張新表 SELECT policy 只針對 authenticated，private.has_org_role 的遠端定義以 auth.uid() 與 organization_members 比對，與 repo 相符。遠端 public/private 可供 PUBLIC EXECUTE 的 SECURITY DEFINER 清單為空，public/private/auth 的 PUBLIC table privilege 清單為空。private.save_goal_turn_impl 是 postgres 擁有的 definer，依 JWT uid 做 owner 檢查、鎖 organizations 列，再追加問答與 audit；public wrapper 為 invoker，轉譯 PT409。SQL client 可設定 request.jwt.claims／sub，因此把 authenticated 或原 RPC EXECUTE 直接授予任意 LOGIN 會允許冒用其他已知 uid，不能保證 Fixture A 限定。

在「不新增角色／不新增可信函式／不改安全設定」條件下，**沒有可安全授予既有直連驗收者的 GRANT 組合**。以下是另經精確批准後才可能建立的隔離探測通道，不能當作現成憑證或既有角色：

| 項目 | 精確範圍 |
|---|---|
| `growth_os_probe_owner` | NOLOGIN、NOINHERIT、NOSUPERUSER、NOBYPASSRLS、NOCREATEDB、NOCREATEROLE、NOREPLICATION；不加入 authenticated／service_role／管理角色；只擁有下述固定探測函式，不擁有表或 schema |
| `growth_os_probe_login` | 起初 NOLOGIN，NOSUPERUSER、NOINHERIT、NOBYPASSRLS、NOCREATEDB、NOCREATEROLE、NOREPLICATION、CONNECTION LIMIT 3；本人完成密碼安全輸入後才啟用 LOGIN；VALID UNTIL 精確批准啟用時間加 2 小時；不加入其他角色 |
| schema | 新 `growth_os_probe`，由既有管理者擁有；REVOKE ALL ON SCHEMA growth_os_probe FROM PUBLIC；不列入 PostgREST exposed schemas，不改 public/private/auth schema ACL |
| LOGIN 的 GRANT | `GRANT CONNECT ON DATABASE postgres TO growth_os_probe_login; GRANT USAGE ON SCHEMA growth_os_probe TO growth_os_probe_login; GRANT EXECUTE ON FUNCTION growth_os_probe.append_fixture_turn() TO growth_os_probe_login;` 除既有 PUBLIC 基礎能力之外，沒有表讀寫、原 RPC、private schema 或 owner 角色會員權 |
| NOLOGIN 函式擁有者的 GRANT | `GRANT USAGE ON SCHEMA growth_os_probe,public,private TO growth_os_probe_owner; GRANT EXECUTE ON FUNCTION public.save_goal_turn(uuid,uuid,uuid,integer,text,text),private.save_goal_turn_impl(uuid,uuid,uuid,integer,text,text) TO growth_os_probe_owner;` 這是可信函式角色的跨租戶能力，不可授予 LOGIN 或讓 LOGIN SET ROLE 到它；建立／移轉函式所需 schema CREATE 只在原子 DDL 交易內暫授，交易結束前 REVOKE |
| 唯一新函式 | `growth_os_probe.append_fixture_turn()`，零參數、SECURITY DEFINER、空 search_path、由 probe_owner 擁有；先檢查 session_user 必須為 probe_login 與硬編碼的批准截止時間，再覆寫 claims JSON 與 claim.sub 為原 Fixture A owner（e85f1a90-3565-4fc1-a7e0-3b7d08830d0e）；只呼叫原 public RPC 的固定 org=93a88055-0a0b-40c0-b22f-a6d312320001、goal=5055ca31-40cc-435d-9f52-cdf19166440c、expected_version=13、question_key=audience、固定清楚標示的合成答案，request_id 由伺服器產生；不接收任意 SQL、uid、org、goal、答案或版本；明確 REVOKE EXECUTE FROM PUBLIC 與其他 client roles，只有 probe_login 可呼叫 |

這條通道新增受控 definer，需先有本地實作與拒絕案例的安全審核，不能只按上述 GRANT 即上線。固定資料可防止任意 JWT／其他租戶／其他目標；但 SQL LOGIN 可以 COMMIT，不能技術上保證呼叫者一定 rollback：批准必須明確涵蓋「最多追加一筆固定合成修正」的能力，expected_version=13 使成功 commit 後的其他新 request 都被 PT409 拒絕。原有歷史不能 UPDATE／DELETE。若連此固定寫入能力也不允許，方案不能完成現版真實 RPC 的鎖驗收。

實驗只開 3 條相同 LOGIN 連線；A 呼叫固定 probe 函式取得未提交鎖，B 在 A 未釋放時呼叫，C 只查看同角色的 pg_stat_activity／pg_blocking_pids，無 pg_monitor／pg_read_all_stats GRANT。測試連線設定 lock_timeout=5s、statement_timeout=15s、idle_in_transaction_session_timeout=30s，client 亦有 20s 截止。需在 holder／observer 屏障證據取得後立即 A rollback，B 返回後 rollback；三條連線最後關閉。角色預設 timeout 可被 SQL client 改寫，VALID UNTIL 也不關閉已建立的連線，不能將它們描述為不可繞過的安全邊界；固定函式有獨立截止檢查，逾時清理需管理者限定只終止此 role 的三條連線。

清理精確順序：中止尚未完成的 probe 交易並關閉連線；ALTER ROLE growth_os_probe_login NOLOGIN；REVOKE EXECUTE ON FUNCTION growth_os_probe.append_fixture_turn() FROM growth_os_probe_login；核對該 role 無活動 session（若有，只終止匹配該 role 的 session）；DROP 固定 probe 函式，撤回上述 probe_owner 與 LOGIN 的授權，確認 schema 空與兩角色無其他擁有物件／會員權後 DROP SCHEMA growth_os_probe、DROP ROLE 兩個 probe 角色。禁止 DROP OWNED CASCADE、輪替共享密碼、撤回 authenticated 既有權限或回退資料。所有建立／cleanup DDL 的精確 SQL 應在批准前保存成可審查的本地檔案；本輪沒有建立它們或輸入密碼。

最小必要批准請求草案（未發送）：是否允許只在隔離 Supabase vhzryhibmpvglzcmfnaa 建立上述 2 小時／3 連線／僅 Fixture A 固定目標的 probe 通道，允許最多一筆固定合成追加並按列明範圍清理？新資料庫密碼須由本人在不回顯的安全提示輸入，不能貼到聊天、文件或日誌。未批准前只做本地草案與唯讀核對。

本地補證評估：既有 PGlite 是單個 PostgreSQL WASM 引擎，不能用兩個 JS Promise 代表獨立後端；既有 libpq/17.6 的 psql／initdb／pg_ctl 客戶端可用，但同目錄沒有 postgres 伺服器 binary，目前沒有確認可用的本地 native server。未安裝／啟动新服務、未重跑 9 組 PASS。若後續取得本地獨立 PostgreSQL，可在合成 uid／同 schema／RLS 下驗證兩後端鎖等待、rollback 與 wrapper 固定 fixture 拒絕；仍不能代替遠端已部署版本、真实 Supabase session／pooler、自然 JWT 到期或遠端角色授權驗收。


## 受限探測通道離線草案與新增安全測試（目前檢查點）

精確可審查檔案已保存於 `supabase/tests/goal_lock_probe/`：create.sql.template、activate.sql.template（無密碼值）、verify.sql、cleanup.sql、render.mjs、test.mjs、native_overlap.py 與 README.md 中文批准說明。它們位於 tests，沒有加入 migrations 或部署步驟，沒有執行遠端 DDL。時間模板故意不含猜測日期；批准啟用時輸入該次記錄的精確 UTC T0，離線 renderer 計算 T1=T0+2h，產生四份 SQL 與 window.json 供核對。截止硬編碼於函式入口與等鎖返回後；activate 拒絕窗口外與剩不足 15 分鐘的啟用，不自動延長。

新增 PGlite 安全測試 8 組通過，未重跑原 9 組：角色属性目錄與無會員權；PUBLIC／無關角色／anon／authenticated／service_role 路徑拒絕；SET ROLE／原 RPC／private 實作／表／DDL／任意參數拒絕；偽造 legacy sub 與 JSON claims 均被固定 owner 覆寫；固定 Fixture A 與原 13 筆保留；rollback 無問答或 audit 殘留；最多一筆固定 commit 後 PT409；過期／尚未啟用入口拒絕、啟用目錄／精確 cleanup、renderer 拒絕相對／無效日期。遠端唯讀 auth.uid 定義已核對為同樣 coalesce legacy／JSON 邏輯。runner 初版 PGlite RESET SESSION AUTHORIZATION 未恢复初始測試身份導致後續唯讀失敗，已改為顯式恢復原 session 身份；這是測試 harness 修正，不是產品權限放寬。

PGlite 的 session_user 是 SET SESSION AUTHORIZATION 模擬，角色屬性檢查不代表真實密碼登入、LOGIN 數目或 VALID UNTIL 網路 enforcement；未宣稱雙 PID 重疊 PASS。安全結果保存於 outputs/Growth-OS-probe-boundary-local.json。

能力調查補正：本機實際存在 PATH 外 `/opt/homebrew/Cellar/postgresql@14/14.19/bin/postgres`，先前只查 libpq 同目錄並不完整。使用該已安裝 14.19 嘗試獨立 `/private/tmp` cluster、0700 Unix socket、listen_addresses=''、auth-host=reject；沒有碰既有 daemon 或遠端。先排除 unlinked keg 的 libpq 與 postgres.bki 路徑，僅為子程序設定既有 library 路徑並引用既有 share；仍受編譯期 `/opt/homebrew/share/postgresql@14/timezonesets` 缺失阻擋，暫存 runtime layout 也無法解決。沒有改全域 symlink／安裝／升級服務；沒有成功啟動 native server、沒有 native lock PASS。唯讀確認暫存 probe 目錄剩餘 0；安全失敗摘要 outputs/Growth-OS-probe-native-overlap.json。Python runner 以不寫 cache 的 compile 驗證語法，Node renderer 語法與 git diff --check 通過。

單一最小批准請求仍僅為 README 內草案，未發重複表單；應在精確 UTC 窗口及四份渲染 SQL 可審查後，由父任務呈現。本人安全輸入新 probe 密碼之前保持 NOLOGIN，不使用共享 postgres／authenticator 憑證。現有自然到期分頁未操作，00:02:54 台北後續驗收；M1 仍未全面放行。


## 自然 JWT 到期與瀏覽器重新登入恢復：通過（2026-10-01）

本節更新先前待自然到期的狀態，舊段落保留為當輪歷史。只驗收原保留分頁 1385706650／a0rpg9s0x Preview，不啟動任何 probe 窗口或新部署。

1. 原登入時保存的實際 exp 為 2026-09-30 16:01:54 UTC／10 月 1 日 00:01:54 台北。2026-09-30 16:47:48 UTC／10 月 1 日 00:47:48 台北起，先唯讀觀察同一分頁：仍在原 a0 工作台、Fixture A owner、同一目標與 13 筆歷史；原版初次提示「讀取或保存中…」亦與先前一致。未先刷新、導覽或重新登入，保留證據未失效。
2. 點「重新讀取目標」後，頁面顯示「資料操作失敗（HTTP 401）。已保存的問答仍保留；可重試或重新讀取。若登入逾時，請重新登入。」原目標與 13 筆可見歷史仍留在頁面，截圖保存。這是真實過期工作階段的瀏覽器讀取回應，沒有改 JWT、注入無效簽章或縮短到期設定。
3. 先記錄上述 401，再結束舊分頁工作階段，向既有 owner 測試帳號取得新的一次性郵件並登入同一已批准 a0 工作台。郵件開啟新登入分頁 1385706671；原目標 id=5055ca31-40cc-435d-9f52-cdf19166440c、13 筆完整可見問答與到期前留存內容逐字相同。前後文字 SHA256 均為 `ac02375e2f63ea3dec06ec0ce7cef97861a352a82f7baa18720a5baf2089bd90`。未保存新問答或追加確認、未改角色或資料。

安全證據在聊天 outputs：Growth-OS-natural-expiry-before.jpg、Growth-OS-natural-expiry-401.jpg、Growth-OS-natural-expiry-recovered.jpg、Growth-OS-natural-expiry-accepted.json；JSON 包含合成歷史、比對 hash 與時間，沒有登入 token／一次性連結。新登入結果分頁保留開啟。

驗收結論：此精確自然到期 → HTTP 401 提示 → 重新登入 → 原目標與 13 筆歷史恢復流程通過。驗收來源是原保留 a0 Preview；固定 alias 的新版首次讀取提示另有既有 PASS，本次沒有重跑。當輪 probe 尚未建立；以下最新預備紀錄更新其狀態。M1 全面放行與 M2 仍未宣告。

## 已批准的 NOLOGIN 預備與延後窗口（2026-10-01 最新狀態）

本節取代先前「待批准／尚無遠端角色／硬編碼截止」的目前狀態；早期段落保留為歷史。使用者已批准安全準備，要求先完成 NOLOGIN、延後兩小時窗口模板、本地測試、安全密碼介面與清理，再交接本人輸入。自然 JWT 已 PASS，本輪不重跑、不新增部署。

已實作：create.sql.template 不再包含 T0／T1。管理者擁有 activation_window 表，起點與截止初始 NULL；probe LOGIN 無權讀寫窗口，NOLOGIN owner 只能讀取。固定函式在入口及原 RPC 返回後讀取並核對窗口，未啟用即拒絕。activate.sql.template 之後才以精確 UTC T0 原子填入 T1=T0+2h、設定 VALID UNTIL 與 LOGIN；禁止重複啟用、自動延長或剩不足 15 分鐘才啟用。cleanup 已包含窗口表，依序禁用 LOGIN、撤回 EXECUTE、只終止 probe session、移除固定物件与授權；無 CASCADE、不動業務歷史。

遠端已套用 migration growth_os_probe_nologin_preparation。首次 PostgreSQL 17 函式 owner 移轉缺 SET ROLE 能力，交易整體回退且確認無殘留；修正為交易內暫授管理者 SET、移轉後撤回，重新套用成功。讀回證據 outputs/Growth-OS-probe-nologin-readback.json：兩角色 NOLOGIN、所有管理／bypass 能力 false、probe LOGIN 連線上限 3、VALID UNTIL 為 1970 過期值；窗口起點／截止均 NULL、函式 owner 正確、原目標仍 13 筆。probe 兩角色自身無會員权；平台管理者 postgres 保留對新角色的 ADMIN=true、INHERIT=false、SET=false。未輸入密碼、未啟用窗口、未呼叫 probe。

延後窗口版新增本地安全測試 9 組 PASS，outputs/Growth-OS-probe-deferred-local.json。涵蓋 NULL 窗口拒絕、權限與角色目錄、偽造 claims 覆寫、固定 Fixture A／原 13 筆、rollback、最多一筆固定 commit 後 PT409、未開始／過期拒絕、原子啟用與精確清理、嚴格 renderer。這是 PGlite 模擬，不能當作真實密碼 LOGIN、網路到期／連線數 enforcement 或遠端獨立交易重疊通過。既有 native timezonesets 阻擋仍在，未安裝或改系統服務。

本人交接介面為 supabase/tests/goal_lock_probe/set_probe_password.command：固定隔離專案 session pooler、TLS verify-full、psql -X -W、不使用密碼檔／環境密碼；本人先輸入既有管理密碼，再以 psql \password 的不回顯提示輸入新 probe 密碼兩次。脚本不收密碼參數、不寫檔、不啟用窗口；zsh 語法檢查通過，真正連線與密碼設定待本人操作。不要把密碼貼進聊天、SQL Editor、命令列或日誌；若未知既有管理密碼則停止，不重設共享密碼。

下一步驗收仍待開發／執行：本人設定密碼成功後核對實際窗口 T0／T1，才啟用並以三條獨立 session pooler 連線取得 holder／contender／observer 屏障與 blocking PID 證據；兩筆交易 rollback，確認原目標／13 筆與 audit 無追加，立即清理並核對角色／schema／session 不存在。沒有此遠端證據，M1 不全面放行；M2 與新介面仍屬後續規劃。

## 2026-10-01 本人密碼腳本 TLS 故障修復

本人執行腳本退出 certificate verify failed，尚未確認密碼設定成功。無 credential 的 libpq 17.6／OpenSSL 重現證明 system CA 無法驗證 Supabase Root 2021 CA；保持 verify-full，依官方 psql 文件與官方 Dashboard 原始碼的 HTTPS 下載來源取得公開 CA，放在 probe 工具目錄並核對指紋。脚本僅為本次連線指定 sslrootcert，不改全域信任、SSL enforcement、LOGIN、window 或密碼／權限。

無密碼 --check-tls 已通過 certificate 與 hostname 驗證；錯誤 hostname 仍拒絕 (62)。libpq 指定 CA 後不再 TLS 失敗，而在未提供密碼處停止。這是 TLS 修復證據，不是真正登入／密碼設定／遠端並行 PASS。02:03:58 UTC 唯讀核對：NOLOGIN 兩角色、NULL 窗口、probe sessions=0、13 筆歷史。官方 CA URL、SHA256、有效期、限制與本人最小重試統一於 [probe README](../supabase/tests/goal_lock_probe/README.md#2026-10-01-tls-修復與無密碼驗證)。原自然 JWT PASS 不重跑。

## 三連線 readiness 更新（2026-10-01）

主管已看本人手動密碼流程完成截圖，无TLS/TCC/SQL錯誤，但未明示退出碼；仍不能宣稱probe真登入成功。新增本人運行的run_probe.command／remote_overlap.py，A/B/C psql各自行不回顯收取密碼，controller不讀或轉存密碼；固定函式、3PID、C同時觀察B Lock/blocker=A、兩次rollback、退出後本人管理連線cleanup與非敏感證據保存已備妥。7個離線控制器測試通過，不能代替真正Terminal／TLS三連線。

遠端OID18474固定函式ACL與文件不同：PUBLIC EXECUTE、无explicit login，client無schema USAGE；已備妥單一函式reconcile（暫時SET owner、限定DCL、撤回臨時SET）及create／activation／cleanup operator修正，新增非superuser本地回歸通過。修正未套用遠端，窗口保持NULL／NOLOGIN。缺口為主管審查ACL、確切T0/T1、基準hash、本人一次安全hand-off（3次probe密碼＋1次管理清理）；若本人取消／OS停頓或前置檢查失敗，主管需即時管理MCP cleanup fallback，不能承諾所有失敗自動撤回。完整精確SQL、操作與驗收條件統一於 [probe README](../supabase/tests/goal_lock_probe/README.md#三連線本人交接控制器與啟用前-acl-審查)，M1仍未全面放行。


## 2026-10-01 安全審查補強（本機，窗口未啟用）

本批補齊 d4b9bf6 的精確 grantor 與清理缺口：reconcile 只允許 OID18474／原 ACL／兩條 supabase_admin grant／NOLOGIN NULL 窗口的既有狀態，臨時 SET grant 明確 GRANTED BY postgres，撤回也限該 grantor；完整原 membership、函式定義與角色非秘密屬性 before/after 相同。ACL 成功末態精確 owner/login EXECUTE。中途 division-by-zero 與四種漂移拒絕皆驗證 rollback 保留原狀。

清理順序以此節及 [probe README](../supabase/tests/goal_lock_probe/README.md#三連線本人交接控制器與啟用前-acl-審查) 為準：先獨立提交 NOLOGIN，再只終止 probe sessions，讀回 false/0，最後撤 ACL／物件。管理 connector 逐步執行 emergency_disable.sql，不能把前置封鎖與可能失敗的 DCL 包在同一次隱式交易。管理密碼等待／取消／OS 中斷時，主管立即用既有 connector 接手，不等本人或有效期；未新增服務、cron 或權限。

本機結果：ACL 6 案例及 controller 8 unittest PASS。PGlite 0.5.8 實際為 PG18.3 WASM，PG17 僅核對官方 GRANT/REVOKE 文件；未把本機 mock 當 PG17／TTY／TLS／遠端並行 PASS。原 JWT 已通過，未重跑。尚需單項精確 ACL 安全審查；本批未改遠端、未 push、未部署、未啟用窗口，也未請本人操作。M1 的遠端重疊／清理與歷史 hash 驗收仍未完成，M2 不因本機準備完成而放行。


## 2026-10-01 12:51 台北：已批准 ACL 修正完成（窗口仍未啟用）

本人批准後，原樣套用 1d98452 的精確 reconcile_acl.sql，隔離專案 migration growth_os_probe_exact_acl_reconciliation 成功。PG17.6 獨立讀回確認 OID18474 ACL 只有 owner/probe EXECUTE；PUBLIC/anon/authenticated/service_role 無有效執行權。owner/config/函式定義 hash 不變；原 supabase_admin grantor 的兩條完整 membership 保留，臨時 postgres grant 撤回；角色仍 NOLOGIN、窗口 NULL、sessions=0。原目標及 13 筆歷史、13 筆 audit 的 count/hash 與交易前完全相同。

證據 outputs/Growth-OS-probe-acl-remote-1d98452.json；精確 SQL SHA256 與 handoff／獨立管理備援複核統一於 [probe README](../supabase/tests/goal_lock_probe/README.md)。此節取代「ACL 尚待審查／尚未套用」的目前狀態，但不變更原批准範圍。尚未啟用窗口、未請本人輸入密碼、未部署或 push、未重跑自然 JWT。M1 仍缺真實三連線重疊、rollback、完整 cleanup 與原資料雜湊核對；本次 ACL 完成不算整體 M1 放行。


## 2026-10-01 13:35 台北：受限真實並行驗收完成

此前受限直連的真實三 PID／同時 Lock blocker 缺口已完成：T0/T1=05:31:41–07:31:41UTC，本人 run_probe.command 取得 A366169/B366171/C366172，B 等鎖 blocker=A，兩交易 rollback、client 關閉，管理 cleanup exit0。獨立管理讀回確認 probe 固定函式/schema/兩角色/session 全0，原目標、13筆歷史、13筆 audit 的 hash/count 與啟用前一致。未提交固定追加，沒有业务資料改動。

原始 controller JSON 保留其 full_acceptance=false；可信獨立讀回與控制器證據整合後，`outputs/Growth-OS-probe-final-acceptance-20261001.json` 明確記錄 full_probe_acceptance=true。完整時間、PID、備援觀察與清理條件統一於 [probe README](../supabase/tests/goal_lock_probe/README.md)。Supavisor 後端短暫保留已由管理 cleanup 撤回，沒有重複備援 DDL；舊告警時間點不能取代最終讀回。

本機 approved-window.json 已歸檔，遠端通道已完全撤回；本次受限並行缺口關閉，不再請本人輸入密碼。自然 JWT 已 PASS 未重跑，未新部署／push。其他 M1／後續 M2 範圍仍按既有藍圖驗收，本次結果不把未實作能力寫為已完成。
