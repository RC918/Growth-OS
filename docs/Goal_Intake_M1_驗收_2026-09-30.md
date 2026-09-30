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
