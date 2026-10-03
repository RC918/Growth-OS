# M3 隔離驗收 envelope：19:30 技術截止候選

Owner來源 `Sentinel_10d81d4907e0819193fc417ce458fc71`，目的僅 **Save → Logout → Login → Readback → 權限／tenant驗證**。Envelope至M3驗收完成自動失效，與本包保守技術截止 **2026-10-03T19:30:00.000Z（台北10/4 03:30）**分開；不得移除或自動延展SQL時間／固定身份／1parent1version1audit硬閘。Save function到期拒絕呼叫不等於ACL自動撤銷，cleanup仍必做。

完整 [execution-manifest.json](execution-manifest.json) 綁精確hash、既有IDs、前後狀態及次數。本輪僅repo準備，未遠端查詢／mutation、未enable或部署runtime config；實際兩份config仍false/false/null。原14:30及其他歷史包、generator、payload均保留。新SQL/config相較14:30僅literal cutoff改為19:30，cleanup bytes完全相同。原generator的candidate/not-approved模板註解保留；新包須既有Reviewer審查後父才評估正式route可執行性。

## 最小操作預算與固定資料

- 正常路徑 **2 migrations**：opening一次、cleanup一次；預期history **19→20→21**。僅在CONFIRMED_NOT_APPLIED、有明確防重放／冪等證據且平台允許時，原操作至多安全retry一次；這不表示可盲增history或重試Save。
- **2 runtime config部署**：open（schema=true/save=true/固定trial）及closed（schema=true/save=false/同trial）。目標僅 `apps/web/url-result-config.mjs` 與 prototype同名mirror；本輪不套用。
- **2次既有帳號新登入、其間1次logout、最多1 Save POST、0 Save retry**。額外fixture mutation **0**，新增account/org/member **0**；readonly檢查依下列證據需求有界執行，不改secret。
- Actor `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e`；org `93a88055-0a0b-40c0-b22f-a6d312320001`；parent `9bafbb2f-eea7-48ea-bc23-3896897f19c3`；request `4d602b3f-272f-4282-9906-b0cc0155e1c7`；expected **0**。唯一payload仍是 `../synthetic-export.json`，SHA及source/content/request digests見manifest，持久最大 **1/1/1**。

## 不繞過舊未知操作或安全拒絕

沿用已知opening operation/name `url_result_bound_open_20261003_1430`，保留舊opening SHA及receipt遺失／後續拒絕紀錄。名字中的1430是原operation身份，不是本次有效截止；本次artifact SHA明確對應1930。改截止是**新審查artifact revision，不是舊SQL相同bytes的retry**，不得因新批准而清除未知舊request或重置attempt證據。

先fresh authoritative reconciliation所有相關operation/history/catalog/ACL與固定request。若舊版已套用，不重播opening；核其實際cutoff/body並先處理已開權限／已保存結果，不能假稱1930版已套用。若仍未知，不dispatch新revision；若STATE_DIVERGED停mutation。相同SQL併發防重放能限制有效opening數，但不能保證1930版一定勝過晚到1430版。Cleanup提案name `url_result_bound_close_20261003_1430`僅為待審追蹤，先核有無既有等效cleanup，不能靠新ID繞過未知opening。

父只在同正式apply_migration route提交新Owner envelope作安全判定新證據；仍拒絕即停。不換route／改名／用Reviewer接DB、不用backend JWT或索取secret。此前13:49 snapshot只是歷史，不能代替fresh preflight。

## Pipeline、preflight與成功標準

1. **Reviewer＋CI**：核目前branch/PR19、新包exact SHA及最小變更。兩角色維持Primary唯一writer、Reviewer readonly。
2. **Readonly preflight**：確認project=`vhzryhibmpvglzcmfnaa`、既有owner身份／membership、既有Preview `/workspace.html` 與redirect allowlist、安全handoff；核完整19history含closed marker、URL schema/guard不存在、ACLclosed、固定parent/request/audit均空、既有24 hash/count與ledger原值。歷史任一步已生效時先reconcile，不硬套19假設。技術窗口須足够做唯一Save並立即cleanup；不能先enableconfig。
3. **Opening→postflight**：history20只有對應migration且statement/hash正確；URL欄位/constraints/triggers、legacy guards、Save body中的固定scope/hash與19:30 cutoff一致；僅兩個authenticated Save entry可execute，其餘helper／table權限未擴。資料／ledger不變。
4. **Open config→login1→GET→Save**：核部署HEAD/config及正式existing login，固定request先GET；存在即核原UUID／payload，只讀不另Save。從未attempt且GET無row才可匯入唯一frozenpayload並手動確認最多1POST。record request/returnedUUID/hash；unknown只GET，同tabsessionStorage標記不清。runtime未知不得用新的request解套。
5. **立即cleanup＋closed config**：即使Save未知或失败也處理收尾。核history21、Save兩entry對PUBLIC/anon/authenticated/service_role effective EXECUTE全false、closed config save=false、bound body及原資料/ledger保留。無刪除資料或恢復通用Save；到期不免除cleanup。
6. **Logout→login2→readback**：同一受控tab新登入；精確org/request/knownUUID、creator、version1/draft、full payload bytes/canonical hash與來源／內容摘要一致，列表／詳情可讀、Save不復活、無額外POST。成功Save時精確持久1parent/1version/1audit；若0或未知只報事實，不能當Save驗收PASS。
7. **權限／tenant只讀驗證**：真登入actor只可讀自身org成果；核既有RLS policies/role/table/helper ACL，cleanup後Save effective ACL關閉。使用既有、preflight已確認存在且該actor無membership的隔離測試tenant資料作negative GET，與authoritative控制查詢對照，零可見資料；不要用根本不存在的row作RLS證明，也不新增fixture或冒用claims。若現有資料／兩次登入無法涵蓋某角色矩陣，列出未驗收項交Reviewer，不能把離線role PASS冒充runtime驗收，亦不私加帳號／登入／POST。
8. **Acceptance**：記每步operation/deployment IDs、SHA、時間、expected/actual、classification及證據。全部約定M3成功標準成立才標M3完成且envelope失效；這份固定case本身不自動證明所有M3／v2條件。普通問題在既有envelope內恢復；STATE_DIVERGED、production/security/data-loss risk或超出envelope才重新通知Owner。平台拒絕依原限制停止，不能視為普通可retry失敗。
