# 停寫部署包｜已部署並保持停寫

現況（2026-10-03 UTC）：父已依 Owner 單次批准部署 [`closed-package.sql`](closed-package.sql)，並完成獨立 SELECT-only postflight，保存入口保持停寫。檔案仍只在 drafts，migration discovery 不會載入；不搬檔、不建立另一 migration 或 reconcile 檔名。本次文件更新僅記錄父提供的結果，沒有再次連線、執行或重跑測試。不得用 execute_sql 繞過 hosted 的 DDL 路由要求。

SQL SHA-256：`6a711df72cdf5bd5700f7148aa98b1982ca1209c5b5fe2fdf48a3a1288275beb`。

原 proposal SHA-256：`c7ea292b44cbb038a6384fb178e9542905e99cd36db5e4a09ef3b23ccdb1d87d`；原檔未改。Owner 的限定一次執行批准已由父使用完畢；沒有剩餘部署／開 grant／登入／真保存授權。


## 2026-10-03 遠端部署與獨立 postflight（父提供）

Owner 04:01:01 明確同意 03:32 的限定一次 closed deployment 問題，批准識別 `Sentinel_ae3797f439c081918dec7fa3929e6d89`。父於 04:05–04:06 對隔離專案 `vhzryhibmpvglzcmfnaa` 只呼叫一次 apply_migration，name=`first_result_closed_package`，使用 `a150bebbe549f862c41dd93a16ea72cd4a74e626` 的本檔 SQL，tool 回 `success:true`。以下為父 04:10 的獨立 SELECT-only postflight，不是本 agent 新查詢：

- 總 migration 紀錄 **18→19**；新增 `20261003040602 first_result_closed_package`。持久記錄的 statement 為 **52,447 bytes**，完整內容／SHA-256 與上述 SQL 相符。**19 是總 migration 數；13 是原 goal history 的 row 數**，兩者不可混稱。
- 15 個新函式 body／signature／flags 精確符合包：owner=`postgres`、empty search_path；這 15 個之中只有 private save impl 是 SECURITY DEFINER。全部新函式對 PUBLIC／anon／authenticated／service_role 有效 EXECUTE 均為 false，且沒有 non-owner grantee。
- 四個欄位、約束與既有 typed-review guard 正確。24 個 relation/subset 的 count＋SHA 全部相同；20 張業務表合計 87 rows、audit 30 rows、原 goal 13 history、ledger 與 2 筆 settled attempts 不變。Typed rows、first-result audit、測試 request IDs 的持久 rows 都為 0。
- 既有 3 個 ancillary functions 與 review 另有獨立前後快照比對。其餘既有 functions 與 PostgreSQL role membership 的保留，是由精確 package 內 security assertions＋apply success 支持；**不宣稱這些都有完整的獨立外部快照**。

此結果驗收 schema 已追蹤部署、入口保持停寫與測試資料無殘留；沒有真 JWT／Data API／登入／Save／跨 session 驗收。唯一 remote attempt 已用完；30 分鐘窗口不是額外次數或操作批准，不重跑、不開 grant。Hosted schema＋history 的通用原子性契約仍未知；這一次成功對帳不能推廣成所有失敗都會共同回滾。

## 相對 proposal 的精確差異

- 完整保留 proposal 的 schema／函式／約束 body；自嵌入 DDL 僅移除原 BEGIN／COMMIT 與兩行 authenticated 永久 GRANT。測試逐字核對這個差異，沒有改變保存／review 函式內容。
- 唯一頂層 SQL statement 是 invoker `DO`。DDL 以 EXECUTE 執行；包本身没有 BEGIN TRANSACTION、COMMIT、ROLLBACK、SAVEPOINT 或 session-level 設定，不依賴 hosted 外層交易。
- 外層保存 20 張 public 業務表的原欄位投影摘要／筆數與 private.model_trial／model_trial_attempts；content_versions 排除新增四欄後比對。另核表 ACL／owner／RLS、policies、角色 membership、既有函式定義／ACL／owner／設定；review 只有預期 body 變更可通過。
- 內層 PL/pgSQL exception block 建立子交易，臨時 GRANT 兩個新保存入口、切 authenticated／固定 claims，執行一次正向保存及拒絕案例。只有全數斷言完成才設定 tests_passed 並拋 `ZFR01`＋固定訊息。handler 同時核 boolean 與訊息；過早或錯誤 marker 重新拋出。其他錯誤不捕捉；負向案只捕捉指定 SQLSTATE，意外接受用 P0001 使整句失敗。
- 捕捉成功 marker 時，PostgreSQL 回滾子交易的 version／audit、GRANT、ROLE、claims。外層再驗停寫與不變性，正常完成 statement，沒有故意讓 hosted migration 報錯。
- 使用 transaction-local lock_timeout=3s，完成前恢復呼叫者設定。這不是全句執行時間或 hosted 工具期限保證。無新 store／臨時表／角色／刪除資料路徑。

成功留下的變更只有四欄、org/request UNIQUE（含其索引）、新 typed/legacy CHECK、15 個新函式（13 helper＋兩保存入口）、既有 review guard。兩新入口與 helpers 對 PUBLIC／anon／authenticated／service_role 都不開放；ACL 也拒絕任何非函式 owner 的額外 EXECUTE grantee。對三個 client roles 另用 has_function_privilege 核對有效權限，包含繼承；管理者仍保有管理能力，不能把停寫說成管理者也不能修改資料。

## 部署前固定 fixture 與 preflight（歷史基準）

父提供的唯讀遠端資料（本輪未重新連線）：PG17.6、20 public 業務表 RLS、18 migration 紀錄（13 business＋5 probe/trial）、原 goal 13 turns/max v13，legacy 定義符合 repo，沒有 proposal 碰名或相關 trigger/sequence/rewrite。

包固定以下 ID，不任選、新建、刪除或修改 membership：

- Org A `93a88055-0a0b-40c0-b22f-a6d312320001`；owner `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e`。
- Org B `93a88055-0a0b-40c0-b22f-a6d312320002`；viewer `5d14dbf9-e9ef-453b-8760-e48a20fa63ad`，且不得有 A membership。
- Parent `a6f7775d-501f-45e6-b15e-6e8d74a26c09`：A 的 approved opportunity、恰 1 source／1 approved decision、0 versions，expected=0。
- 原 goal `5055ca31-40cc-435d-9f52-cdf19166440c`：13 turns、max v13；完整內容與 audit 由全表投影涵蓋。
- 正向 request `a82815b2-efc3-4a95-9d40-fbccd9b94001`，衝突 request `a82815b2-efc3-4a95-9d40-fbccd9b94002`；只用本地既有 builder 的第一份固定合成 report，已嵌入包，不在執行時取得新來源。

執行時重新核對上述 gates、20 表集合／RLS、名稱／欄位衝突、原 review body 與函式 owner 等於 invoker 管理者；有非 internal public trigger、表 rewrite rule 或 version/audit 預設值的 sequence dependency 也停止。identity 僅由現有 membership 核對，不能當成帳號登入資格／JWT 有效性證據。

內層斷言：完整 JSONB payload（含三欄、bytes、引用、原建議／Review）、title/body 投影、回傳 UUID／v1／actor／request、服務端 request digest 與來源／內容不同摘要、一版一 audit；重送同 UUID；異 payload 22023、過期版本 PT409、typed generic review／plan 23514、直接 UPDATE 42501、viewer 自租戶寫入與跨租戶讀寫拒絕。A 沒有 viewer，故不宣稱驗過同租戶 viewer 可讀。

測試預期峰值為 1 version＋1 audit；其他業務列新增 0。任何非預期接受／額外列使整句失敗。成功持久測試 rows 全部為 0；不重跑遠端 deadlock、撤銷會員或故障注入。

## 製作時的離線證據（歷史紀錄）

`node --test supabase/drafts/first_result_save/closed-package.test.mjs`：PGlite PASS，Node 1 test，內含七組檢查：

1. 固定 actor 漂移拒絕。
2. 在臨時 authenticated／claims 下的非 marker 錯誤使 statement 回滾。
3. 正負測試後的真正非 marker 錯誤使 DDL／ACL／rows 全回滾。
4. 過早同碼同訊息 marker 不會被吞掉。
5. 內層已回滾後、外層最終失敗仍撤回 DDL。
6. 本地額外角色以 default privilege＋membership 令 authenticated 繼承 EXECUTE，必須被有效權限檢查拒絕。
7. 同包正常完成，四欄／兩個新 validated constraints／15 函式完整、舊 title CHECK 取代、兩入口停寫、測試 rows 0；20 表原列（含另一 parent 的 legacy 草稿／review）、13 history／audit、非零 ledger／attempts 不變。非空既有 claims、ROLE 與 lock_timeout 恢復。

本地建的 matching fixture 只是合成 ID／gates，不是遠端 clone。沒有 auth secret；PostgreSQL 對首次設定後回滾的 custom GUC 可能留下空值 placeholder，包把 absent／空字串視為相同「無 active claim」，並另外驗原本非空值逐字恢復。

`native.mjs` 在既有固定 PG17.6、--pull=never、--network=none 容器另開一次性 DB，跑完全相同候選與上述檢查，再跑原 native suite。roles 是 cluster-wide，後續原 DB bootstrap 重用同容器既有三角色。原生 runner 以 psql autocommit 執行單一 DO；沒有要求額外外層 BEGIN 才能成功。新增的本地測試角色／fixture 只在可丟棄容器，不進候選包。

製作時本機 syntax PASS；原生實跑因缺固定映像在啟動前 BLOCKED／exit 2，未 pull／啟動容器。當時只有 PGlite 本機實跑證據，新 PG17.6 CI 待父獨立核對；此為當時記錄，不代表目前仍未部署。CI 已在原 SQL 步驟加入新 PGlite test，沿原 native step 驗 PG17。本次文件更新不重跑實作測試，也不補造未提供的 CI 編號／結果。

## Hosted 工具限制與停止規則

依父完成的工具審查：MCP applyMigration 只 POST `{name,query}` 給 Management API、回 success，不自行加 BEGIN/COMMIT、不回 SQL 結果；公開契約未保證 schema 與 migration history 共同交易。

本包的 PostgreSQL statement 原子性與子交易回滾可離線驗證；**hosted schema＋migration-history 原子性仍未知**。即使單 DO 全部成功，history 記錄也可能失敗或回覆遺失；不能承諾 hosted 失敗必然無 schema 殘留。不得以本地 history 模型替代這個未知。

原申請的一次正式 migration 已由父完成，獨立前後讀回結果見上節；總 migration 現為 19，保存入口保持停寫。這份批准不可重用，不能以本文件的歷史候選流程繼續遠端操作。

原停止規則保留：若任何另行批准的操作有 error／timeout 或結果未知，先以獲准的唯讀路徑核對 schema／ACL／資料／history；本次獨立 postflight 已完成，不再重跑。若 schema 與 history 不一致、部分狀態未知或對帳不同，停止回報，不重送、不改名再套、不刪 history／欄位或補 grants；後續修復另審。非預期 active grant 必須作失敗回報，不能把此候選當事後清理授權。

不包含真 JWT／API／瀏覽器登入／跨 session 讀回／URL mapping／新 Save 接線。記錄部署時 client SELECT 尚未改；後續 repo 已接上三個 metadata 與單版按需 GET，僅通過本機合成驗收，見 [唯讀讀取契約](../../../docs/Typed_Draft_Workspace_唯讀驗收_2026-10-03.md)。沒有新增遠端查詢或授權，停寫狀態下不能宣稱產品保存／恢復完成。
