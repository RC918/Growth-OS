---
name: recovery-reconciliation
description: "Growth-OS 異常恢復與 authoritative state 核對。用於阻塞目前 milestone 的失敗、timeout、lost response、unknown mutation、CI 或工具狀態不確定；恢復後回原任務。不要把非阻塞缺陷變成修復工程、把缺回傳當未套用，或用來繞過安全拒絕／期限／批准範圍。"
---

# Recovery and reconciliation

## 何時使用／不應何時使用

執行中出現異常時使用，先判斷是否阻塞當前 milestone。不要用來搜新問題、改產品方向或把一次不確定結果擴成另一套工程。非阻塞問題記 debt 後立即返回原主線。

## 執行規則

1. **CLASSIFY → 是否阻塞當前 milestone**。分開記 FAIL（有失敗證據）、未實作、未驗收、工具不確定、Owner決策；timeout／lost response／unknown mutation 一律先記 **UNCERTAIN_RESULT**，不等於 FAIL、NOT_APPLIED 或 Owner blocker。依 [mission-guardrail](../mission-guardrail/SKILL.md) 分嚴重度；P3/P4不阻塞，P2須有milestone必要性。
2. 不阻塞（含 P3/P4）：依 mission 在既有紀錄寫完整 Technical Debt，**resume exact previous task**，不一路修到底。只有當前 milestone 的 P0/P1／必要 P2 才進入 FIX：**diagnose → authoritative reconcile → safe recovery → verify → resume exact previous task**。先讀實際logs與失敗輸入，普通CI fail不可blind rerun。
3. 保存恢復書籤：原任務／milestone、當前步驟、預期下一步、operation/request ID、attempt數、target/route、artifact hash、批准範圍與截止、dispatch時間、expected-before/after、已知證據。不得記token或secret。
4. 重入／handoff 恢復先從最新 Owner／父派工核定當前 Core、branch、base HEAD 與 envelope，再讀 Git status/diff（包含未追蹤檔內容）歸屬進展；歷史起始訊息、舊 checkout／HEAD、舊工作書籤不得覆蓋最新派工。與當前 Core 相符的未提交修改保留續作，dirty 或歷史分支被其他 worktree 使用本身不是 STATE_DIVERGED；只有與當前 Core 明確矛盾且無法歸屬的變動才停 mutation 並具體核對。既有 engineering 第1條仍適用，不 reset/stash/drop，也不為核舊基準切 branch。用適合該操作的authoritative來源核對：Git HEAD/branch/status/remote refs；DB committed rows/catalog/ACL；migration history/body；deployment ID/HEAD/config/status；CI實際job/step logs；audit、request ID、payload/artifact hash與remote state。記來源與觀察時間，辨別舊cache與fresh state；只觀察到缺紀錄或工具無回傳，不足以假稱未套用。

   | State | 判定與動作 |
   |---|---|
   | CONFIRMED_APPLIED | 完整expected-after吻合；驗證後續行，不重做已生效操作。 |
   | CONFIRMED_NOT_APPLIED | authoritative committed expected-before完整吻合。只在原操作有明確安全冪等／防重放、同route/target/hash、envelope與期限仍有效時retry；目前envelope最多 **一次**，若更窄限制禁止retry則服從。 |
   | STATE_DIVERGED | before/after都不符、未知變動或資料/history/catalog/ACL分歧；**先停mutation**，保存證據只讀診斷，再按風險／不可恢復程度升級。 |
   | UNCERTAIN_RESULT | 證據不足就保留未知，繼續有界只讀核對，不新開另一套修復工程、不盲重送。未知本身不自動成Owner決策。 |

5. committed-state與transport／queue不確定可同時存在。若原call可能晚到，核同操作並發防重放與交易／history契約是否足以限制重複效果；不用無法取得的「完美queue空證據」無限卡住，也不把推論冒充證實。接受有來源的足夠證據並記剩餘風險；套用本包具體判定前讀 [bounded reconciliation](../../../docs/Bound_URL_Operation_Reconciliation_2026-10-03.md)，不能把其SQL特性外推為任意mutation可重試。
6. Retry僅原operation，不換name/request/hash/route、不改期限或擴權。工具重複回錯亦先postflight；至多一次retry後再次未知就核對，不循環。**一次Save POST的envelope禁止retry**，即使GET空亦只讀；一般migration retry規則不能覆蓋更嚴限制。
7. 選最小root-cause修復；同問題第三次局部patch前先RCA，3個相似且同根因改為SYSTEMIC_FIX。修正後從 [Agentic Verification Loop](../engineering-executor/SKILL.md#agentic-verification-loop) 受影響的最早驗證點重新跑到 VERIFY，逐點列適用性／證據，核 expectedstate 與核心流程；更新書籤回原任務，不留在無關維修支線。VERIFY 後仍交既有 Reviewer，Primary 不自行最終驗收。
8. 平台安全拒絕不是可重試timeout：尊重拒絕，不換工具／route繞過。期限到達不自動延展，批准過期不繼續受限mutation；已批准的必要收尾依原範圍處理，不擅自reset/drop/stash、補history或用backend JWT替代安全登入。

## Escalation

一般diagnosis／verification／reconciliation及有界安全恢復在既有批准內自主完成。只有產品方向、重大架構、production破壞性、安全／資料損失、OAuth/2FA/secret、新費用、法律合規或無法恢復的systemic blocker需要升級。STATE_DIVERGED先停止mutation，不把「升級」當繼續修改的許可；明確安全拒絕須報被拒操作與理由。報告保留原task、確證與推論、已用retry budget、剩餘決策；不要求使用者貼secret。
