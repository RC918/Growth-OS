# Bound URL 驗收：操作核對與安全重試

本流程限於 Owner 已批准的固定資料驗收 envelope，不擴為通用 agent 制度。現行 frozen package 為 `27136ff64441f3ff4e74c2057b414165e5b74a73` 的 `supabase/drafts/url_result/bound/owner-candidate-20261003T143000Z/`；父回報同 HEAD CI 全45steps PASS。截止 **2026-10-03T14:30:00Z**，不自動延展。本文件不改 SQL、hash、runtime flags，也不代表子執行緒做過 remote 核對。

## 目前 opening：重要判定

**有條件允許同 name／同 SQL／同 apply_migration route 重試一次；不允許直接因工具缺回傳而重試。** 父須先做 fresh authoritative read-only reconciliation，確認 `CONFIRMED_NOT_APPLIED` 且下列安全條件齊備。若條件不能證明，保留 `UNCERTAIN_RESULT`，自主補查既有操作及 runner 證據；不是自動轉成 Owner 決策，也不新增 raw DDL route。

| 欄位 | 此操作紀錄 |
|---|---|
| operation ID／migration name | `url_result_bound_open_20261003_1430` |
| target | Supabase `vhzryhibmpvglzcmfnaa` |
| route | 原 `apply_migration`，不得換 raw SQL mutation route |
| opening SHA256 | `1c04571433e1d1dc0d21a38157cd63eb22a9eb63f7063bca2a260482abaaacf7` |
| 首次 dispatch | 父回報 2026-10-03 13:35:24 UTC，一次 |
| transport outcome | 回傳遺失：`UNCERTAIN_RESULT` 來源；不是 FAIL 證據 |
| 既有觀察 | 父回報13:38–13:40的全部24 hash/count及catalog/ACL不變；history19無opening，URL columns/functions/triggers不存在，known-opening activity0 |
| 現行 committed-state 判定 | 等父最新 authoritative reconciliation；舊觀察支持「當時未見套用」，不冒充本輪 fresh confirmation |
| retry budget | 原 opening 最多再一次；同 name、同 bytes/hash、同 target/route；不是 Save POST 的重試批准 |

### SQL 靜態安全證據及邊界

1. Opening 是單一外層 DO，內部 EXECUTE 的 DDL、legacy function patch、REVOKE、末尾兩項 EXECUTE GRANT 均在同一交易內。沒有內部 COMMIT，也沒有吞掉 exception 的 handler；DO 失敗時，其 schema/function/ACL 修改一起回滾。這是資料庫 statement 的原子性，不是 hosted migration history 的原子性證明。
2. 入口要求 history count=19、closed marker `20261003040602` 存在、固定 parent/request 不存在。count 沒有鎖住 migration history，也沒有核全部19筆內容；因此必須額外以完整歷史／catalog／資料 baseline 做 preflight，不以單一 count 當完整證明。
3. 第一個實際 DDL 是 `ALTER TABLE growth_opportunities ADD COLUMN entry_kind ... ADD COLUMN source_identity ...`，沒有 `IF NOT EXISTS`。同一表的衝突 DDL lock 使並發重放不能同時完成這個 schema transition：若前者 commit，後者在既存欄位／catalog衝突處失敗，不能走到末尾 grant；若前者 rollback，後者才可能成功。後續 CREATE FUNCTION／TRIGGER 也沒有容忍重複的 IF NOT EXISTS。故在沒有外部 reset/drop 的前提下，完整 DO 的 schema/grant transition 至多成功一次；它不是每次重放都成功的冪等操作。
4. Cleanup 只 revoke、檢查 effective ACL，保留新增欄位、函式及 bounded body。正常 history21 會先阻止 opening；即使 runner history 沒跟上，保留的欄位仍阻止 opening 再次走到 GRANT。因此**原完整 opening 重放不能在 cleanup 後重開 grant**。不能抽出尾端 GRANT、改成 CREATE OR REPLACE／IF NOT EXISTS、刪 schema 或重設 history 來「修復」。
5. Opening DO **不寫 migration history**，也不以 migration name 作唯一冪等鍵。Hosted runner 是否把 DO 與 history INSERT 同一交易、是否在 DDL error 時不新增 history，不能由此檔或既有 PGlite history 模擬推導。同 name 不保證 runner 去重。若 schema 與 history 不一致，或 history 多出未知紀錄，屬 `STATE_DIVERGED`，不能重播／補 history 來掩蓋。
6. Literal 14:30 cutoff 在 Save implementation 內；**opening DO 自己没有期限 guard**。父必須確認仍在期限內才 dispatch opening/retry；不能認為 Save 到期會阻止晚到的 opening 開 grant。晚到或仍在途的操作須保持觀察，若確認已開放則依既有 envelope 收尾 cleanup，不能開始過期 Save。

### 原操作重試一次的必要條件

- fresh read 必須来自正確 project 的 authoritative committed state；核全部原19筆 history及內容、closed marker、無本 opening history、無URL columns/functions/triggers/legacy patch、原ACL及全部預期資料/ledger hash/count不變、固定parent/request均未產生。不要僅用「SELECT看不到」推論沒有未提交交易。
- 原 call 必須已終止或有充分證據排除仍執行／排隊／延遲派送的工作，且無其他 migration operator 在競爭此 baseline。只篩 migration name 的 `pg_stat_activity=0` 不足：實際 query 可能沒有 name、可能在等 lock、或 provider 尚未派送。利用既有操作狀態、交易／lock/activity及 runner 證據只讀核對，不另發 mutation 探測。
- 已知原 runner 的 DDL error 不會留下「已套用」history，或其 migration/history transaction 保證已由可信契約／證據確認；本 repo 尚不提供此 hosted 保證。若此點未知，**不能宣稱完整 migration retry 安全或 history exactly-once**；先釐清，不能盲重試。
- preflight（含 allowlist／安全 handoff）、Owner envelope、同 route／name／SQL SHA、剩餘期限與一次 retry budget 均仍有效。重試前再檢查時間；不改 deadline，不開 config 搶跑。
- 重試後無論工具回傳成功、失敗或再次遺失，都必須 postflight；不再進入自動重試循環。原 call 或 retry 已確認套用時直接續行，不再重試。

## 結果分類與證據紀錄

技術狀態與產品進度分開記錄，不把它們混為一個「blocker」。

| 分類 | 定義／處理 |
|---|---|
| FAIL | 有明確 assertion、SQL error或契約違反的證據；記精確錯誤與影響。工具 error 仍須核對是否已有 committed effect，不能只憑 error 推論全未套用。 |
| 未實作 | 所需程式／功能尚不存在；不能拿未實作冒充測試失敗。 |
| 未驗收 | 已有實作但缺指定驗證證據；沿既有授權補驗。 |
| 工具不確定／UNCERTAIN_RESULT | 缺回傳、連線斷開等 transport 問題；保存 dispatch 資訊，做 readonly reconciliation，不能直接當 FAIL、未套用或 Owner blocker。 |
| Owner 決策 | 真正超出既有 envelope 的範圍／成本／期限／不可逆決策才交 Owner；既有範圍內的安全verification/reconciliation自主續行。 |

每個操作記錄 operation ID、attempt序號、target/route、artifact SHA、Owner scope/deadline、expected-before/after、dispatch時間、transport結果、preflight/postflight時間與查詢／證據、committed-state classification及下一步。不要存 token/secret。

| Committed-state classification | 下一步 |
|---|---|
| CONFIRMED_APPLIED | 完整 expected-after 吻合（opening需schema/guard/function body/ACL與history20匹配）；沿 pipeline 續行，不重送。 |
| CONFIRMED_NOT_APPLIED | 完整 expected-before 吻合；只有原操作具明確安全重試條件時同操作重試一次。不能套用到本次禁止 retry 的 Save POST。 |
| STATE_DIVERGED | history/catalog/ACL/資料與before/after均不一致，或發現未授權修改；立即停 mutation，保存证據，只讀診斷，不擅自修復。 |
| UNCERTAIN_RESULT 尚未消除 | 證據不足或in-flight尚未排除；保留不確定，继续只讀核對，不新增相同 mutation。 |

## 完整 pipeline 與 postflight

1. **Readonly preflight**：核 envelope、deadline、精確artifact/target、history19及原資料/ledger baseline、固定IDs空、closed ACL、既有redirect allowlist／安全handoff。父回報的既有登入成功不取代 allowlist核對。
2. **Opening migration**：使用上述 operation ID／hash；postflight核 history20、本 migration內容、URL schema／constraints／triggers、五個legacy guard、bounded Save body與固定cutoff、僅兩個 authenticated entry grant、helper/table ACL未擴張、原資料/ledger不變。缺工具回傳走上述reconciliation，不直接重送。
3. **Open config部署 → new login1**：僅在opening確認套用後，由父使用同包open config；核部署HEAD/config、固定trial與同源target，再做第一次新既有帳號登入。記錄部署operation/deployment ID與其expectedstate，不能以migration成功代替部署驗證。
4. **最多1 Save POST**：固定actor/org/parent/request/expected0/payload。先GET固定request，attempted標記在POST前同步持久，known UUID保留。未知只GET、不retry，即使GET空或classification看似not-applied仍不突破一次HTTP預算。postflight驗完整payload/hash、唯一UUID及最多1parent/1version/1audit、原資料/ledger不變。
5. **立即cleanup migration＋closed config部署**：cleanup SHA `2932e50569d486e8d4251f20ac8b9c30be1180068ba8b6a897abd8814eb5b80c`；核history21、兩Save entry對PUBLIC/anon/authenticated/service_role的effective ACL關閉、bound body與成果保留。closed config schema=true/save=false/同trial，不刪attempted marker。cleanup未知也先只讀reconcile；其REVOKE資料庫效果可重複不代表hosted history可盲重複。
6. **new login2唯讀取回**：同受控tab完成第二次新既有帳號登入，GET原request/known UUID、完整內容一致、Save不復活。核最大1/1/1持久、唯讀可用及無額外POST；收尾記錄所有operation evidence與剩餘限制。

STATE_DIVERGED時停mutation；若原操作還在途或結果不明，也不能越過opening確認而先部署open config。若期限到達，停止開放／Save；已開放則按既有收尾範圍處理，不能以新deadline自行延長。此文件不新增rawDDLroute、不要求Owner重批已授權的只讀核對，也不把缺回傳隱去。
