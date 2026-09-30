# Vercel 預覽設定

2026-09-30 更新。範圍為 Growth OS 獨立測試環境；不改 morningai、owner-console、正式網域或付費設定。

- 專案：`growth-os-preview`，團隊 `morning-ai`；與既有網站隔離。
- 倉庫：`RC918/Growth-OS`；目前預覽分支 `feat/passwordless-workspace`。早期 `feat/web-preview` 已不是本輪工作分支。
- Framework Preset：Other；倉庫根目錄的 `vercel.json` 輸出 `apps/web`。
- Ignored Build Step：Only build pre-production；本輪確認部署為 Preview，未建立正式環境或正式網域。
- 頁面連接 Growth OS 測試 Supabase `vhzryhibmpvglzcmfnaa`，使用公開 publishable key 與分頁記憶體登入狀態；沒有 service_role／secret key。
- 只使用合成測試資料，禁止輸入真實客戶資訊；固定問題引導不代表 AI 理解、產稿、發布或成長。

## M1 部署與驗收進度

使用者已明確允許恢復本測試環境部署與驗收。應用提交 `a9d0c25` 已 Ready；`30325ef` 修正重複登入的測試導覽並加入遠端回滾 SQL，`apps/web` 與前一提交完全相同，後續預覽亦已完成。兩次新 CI 通過，包含桌面／手機合成 transport 的完整流程。

首次 M1 預覽：[新版工作台](https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html)。精確網址已經使用者批准並保存，設定頁讀回共 13 項，預設 Site URL 保持原值。真實 owner 保存／修正／重新登入讀回及 viewer 唯讀介面已驗收；新 RPC 真實拒絕、API 401 恢復及 PT409 先後版本衝突已通過；DB 交易重疊仍未驗收。本機另修正初次讀取完成提示，尚未部署。

新增 `growth_goal_intake` migration 已套用至上述測試 Supabase。遠端 SQL 回滾驗收通過，測試組織與問答未保留；過去觀測與機會資料保持原狀。完整證據見 [M1 驗收紀錄](Goal_Intake_M1_驗收_2026-09-30.md)。

2026-09-30 目前結果：新問答 RPC 真實 viewer／跨租戶 403 與 API 層真實 401 後恢復通過。先前競爭保存的 40001／504 已記錄；使用者批准後，PT409 精確修正已套用隔離測試資料庫，先後 API 保存 200／223ms、舊版本拒絕 409／PT409／268ms 通過，原歷史與授權保留。未新增 Vercel 部署；DB 交易重疊、自然 JWT 到期瀏覽器恢復及本機提示修正部署後驗收仍未完成，M1 不全面放行。完整證據與回復方式見 [M1 驗收紀錄](Goal_Intake_M1_驗收_2026-09-30.md)。


## M1 接續檢查點：Preview 與剩餘驗收（2026-09-30 23:02）

既有修正已推送至 `6974fc1`，獨立 [Preview](https://growth-os-preview-8uzbiadhu-morning-ai.vercel.app/workspace.html) 已 Ready，來源 SHA 與兩次成功 CI 一致。讀取提示修正已部署，登入後 UI 驗收待此確切 callback 單項批准。先前未部署的記載保留為歷史。

M1 尚未全面放行：自然 JWT 到期工作階段已建立，安全接續時間為 10 月 1 日 00:02:54 台北；DB 屏障探測確認 execute_sql 交易未重疊，仍缺可控制的同時受限連線。精確 PID／時間、分頁與接續步驟統一記錄於 [M1 驗收文件](Goal_Intake_M1_驗收_2026-09-30.md#M1-接續檢查點preview-與剩餘驗收2026-09-30-2302)，不以先後 API 或 CI 取代真實重疊／自然到期驗收。M2、AI 理解與成長計畫保持待開發；未合併、未改其他專案、正式網域或付費設定。

目前更新：固定測試分支 alias 已精確批准並加入，Supabase 讀回 14 項且原 13 項／Site URL 未變；8uz 臨時批准请求 superseded，不執行。6974fc1 新版真實登入後首次讀取提示與 13 筆歷史驗收通過。自然到期及遠端真正交易重疊仍待完成；受限直連安全方案與不能靠現有 GRANT 即限制 fixture 的原因統一記於 M1 驗收文件，未新增角色或安全設定。

受限直連提案已補上 tests/goal_lock_probe 的精確離線 SQL、無密碼啟用、固定兩小時 UTC renderer、中文批准草案及 8 組新增本地安全測試（通過）。PGlite 身份為模擬，仍不算遠端驗收。PATH 外 native PostgreSQL 14.19 已確認存在，但既有編譯期 timezonesets 路徑缺失阻擋暫存 cluster，清理完成且未改系統安裝。遠端角色／憑證／安全設定未建立；詳細證據與限制統一於 M1 驗收文件。

2026-10-01 目前驗收更新：原保留 a0 Preview 分頁自然 JWT 到期後，先觀察未刷新的 owner／13 筆歷史，再重新讀取得到 HTTP 401；記錄後重新登入，原目標及完整 13 筆可見歷史逐字比對一致，該流程 PASS。精確時間、hash 與截圖統一於 M1 驗收文件。未啟動 probe 或部署；遠端真正交易重疊仍待完成，M1 未全面放行、M2 未宣告完成。
