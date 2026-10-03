# Bounded M3 fixed case 驗收｜2026-10-03

結論：本次固定 Owner／固定成果的 Save → Logout → Login → Readback → tenant 隔離／cleanup 子里程碑成立。Reviewer `01a1033d-5d00-757c-9736-76c260242193` 最終 **APPROVE**，唯一必要 P2 已解除；父已通知 Owner。這不是全產品 M3、完整角色矩陣、一般使用者 provisioning、Publish／Measure 或 v2 完整閉環完成。

## 證據來源與已驗基準

遠端操作、authoritative SELECT、signed browser 結果與批准記錄均由父 thread `01a0f25c-a8c0-7271-bf72-18411d628009` 提供，並經上述既有 Reviewer 最終核對。本 executor 只歸檔，不宣稱親自重跑 DB、登入或 Save。本地 synthetic tests 只支持程式契約，不替代以下 live 證據。

- Repository `RC918/Growth-OS`，branch `feat/passwordless-workspace`，PR #19。
- 已驗產品 HEAD：`75e92e5562831258d9d0c6a84c0fd55c0745384d`。
- [CI 37147223203](https://github.com/RC918/Growth-OS/actions/runs/37147223203)：父確認 success。
- Preview deployment `21UoWpB2Lw8qG9AVg25GhNN2t2AF`：父確認 success；實測入口為 `https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html`。
- 隔離 Supabase project：`vhzryhibmpvglzcmfnaa`。

## 固定識別與內容

| 項目 | 值 |
|---|---|
| Owner | `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e` |
| OrgA | `93a88055-0a0b-40c0-b22f-a6d312320001` |
| 已保存 parent | `9bafbb2f-eea7-48ea-bc23-3896897f19c3` |
| request | `4d602b3f-272f-4282-9906-b0cc0155e1c7`，expected version `0` |
| 已保存 version UUID | `4595e34a-0b2d-4a73-984b-d7439b52325c` |
| request digest | `pg-jsonb-sha256:4cc5a9523bbccf6f0d976ce08b78ed3b7763cd69d18ee7bf34b00310e5f5f7a5` |
| OrgB | `93a88055-0a0b-40c0-b22f-a6d312320002` |
| OrgB 既有 parent | `93a88055-0a0b-40c0-b22f-a6d3123c0002` |

匯入的是 frozen synthetic export，檔案 SHA256 `56ea3d35c799f63eb780aa7e1b2b1b6e850a96a4ead6ac913e479fc506cae424`；canonical payload SHA256 `5fd32cb8424a2efe1dfa3f93ba251d0637d34fcd6e77d2b21c342ffb8ed86241`。父確認保存後及 login2 讀回完整 payload bytes 相同。檔案 hash 與 DB JSON／request digest 不混為同一摘要；合成內容的真持久化，不代表真客戶產品品質已驗收。

## 操作時序（UTC，2026-10-03）

| 時間／順序 | 父提供的證據 |
|---|---|
| 18:26 login1 | 真 Owner 登入，AX 身份正確，固定 GET 起始無保存資料；匯入上述 frozen payload。 |
| 18:48–18:49 | 只點一次 Save；沒有第二次 Save 或未知結果重送。 |
| 18:50 | authoritative 證明 1 parent／1 version／1 audit，固定 IDs／digest 吻合。 |
| 18:50 cleanup | `url_result_bound_close_20261003_1430` exact SQL SHA `2932e50569d486e8d4251f20ac8b9c30be1180068ba8b6a897abd8814eb5b80c` apply success，後續 ACL/history postflight 確認。 |
| cleanup 後 | closed config `e645de8b97c0d40aa52ee2843e15f3d6a120b934`；logout → login2 → 精確 UUID／完整 payload 讀回通過。父未提供精確 logout/login2 時刻，此處不補造。 |
| 19:08 | authoritative SELECT 證 OrgB 指定 row 存在，該 Owner 在 OrgB membership=0，建立 negative GET 的有效控制。 |
| 19:23／19:25 login3 | Owner 明確批准 `Sentinel_0fffd7cd30788191b720ca823250a31e`；完成記錄 `Sentinel_7cd32c69fe808191ab5ed88ab7c3fd0c`。 |
| 19:27:19.973Z | 第三次真 signed Owner session 點一次已 review 診斷；OrgA 指定 parent 精確 1 row，OrgB 指定 parent **成功回應 0 rows**。不是 HTTP 401/403、網路失敗或格式錯誤冒充 PASS。 |
| 最終 | Reviewer APPROVE；24 原資料投影 preservation、history 總數 21、兩個 Save entry ACL 全 closed，固定新增 1/1/1 保留。 |

兩個 Save entry 指 public `save_url_result_draft` 及其 private implementation，PUBLIC／anon／authenticated／service_role 有效 EXECUTE 全 closed（父 postflight）。runtime 兩份 config 的 reviewed closed SHA256 均為 `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`，schema=true/save=false，fixed trial 與 19:30 UTC cutoff 保留。

操作總額為 **1 Save、3 次既有 Owner login、opening＋cleanup 兩次 migration**。原 manifest 的兩次登入／兩次 config 部署計畫已有明確修訂，追加一次 login 與一次唯讀診斷 Preview；第三次 login 亦獲上述 Owner 個別批准，不能稱仍在原兩次預算。CI 修復 push 是歷史已記錄操作，不以此文件重新授權任何部署。

本轮遠端 fixed-case envelope 視為已收尾。不得再 Save、reopen、新 remote mutation 或 login；SQL 技術 lease 沒有延展。一般 repo 治理持續有效，但不代表新的遠端授權。

## 下一個最小 Core 提案（待父核分配，未實作）

依 [v2 第 6／8 節](AI_Company_Growth_OS_執行藍圖_v1.md)，M3 尚含成果微調、版本確認、來源／版本漂移失效、取消保留資料與 owner/viewer 整合。現在 workspace 的已保存 typed URL 成果僅能唯讀展開；既有 `first-result-review.mjs` 提供本頁 Review，尚無從已保存精確版本恢復續編的使用者入口。固定案例 PASS 不解決這個續編缺口。

選一個 Core：**從已保存成果開始續編，取消時保留已存版本（離線整合）**。使用者從 workspace 精確讀回的版本進入既有三欄 Review，基於該版本修改並重新確認；清楚區分已存版本與尚未保存的修改。沿用現有 Review／payload 驗證／精確 UUID 讀取，不另造 store、通用診斷或第二套 editor。首切片以本地合成 transport 驗證，保持遠端 Save closed，後續新版本持久化需另核分配及遠端授權。

驗收準則：

1. Owner 從精確 UUID＋org／parent／version 匹配的已存 payload 開始；三欄初值等於已存內容，來源 bytes／citations／原建議可追溯，禁止把已修改文案重標為來源原建議。
2. 修改只形成未保存的續編狀態；舊 confirmation 不得當新核准，重新確認須綁定目前內容與原始版本。UI 不誤稱已保存、已發布。
3. 取消丟棄本次未保存修改並返回原已存成果；來源、原已存版本及歷史不變。viewer 保持唯讀，登出／tenant／base version 漂移及晚回覆不得恢復舊續編或舊確認。
4. 1280／390px 完成「讀回 → 續編 → 重新確認／取消 → 原版本仍可讀」；測試精確版本不符與角色／session 漂移拒絕，零新增遠端 mutation。僅回歸受影響契約，不重演這次已 PASS 的 live fixed case。

這是可審查的普通 repo／offline slice 提案，不自行擴展架構、啟動新遠端測試或外部發布；仍不代表完整 M3 或 M4/M5 完成。
