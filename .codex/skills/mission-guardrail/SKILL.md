---
name: mission-guardrail
description: "Growth-OS 工程選題與主線守門。開始 milestone 工作、選下一任務、缺陷分級、maintenance 連續增加或檢查核心進度時使用。不要用來主動搜非阻塞問題、擴產品方向、解除安全限制，或把明確限定的文件任務變成產品工程。"
---

# Mission guardrail

## 何時使用／不應何時使用

工程開始與選下一步前先用；在 repair、CI 或工具問題擠壓核心進度時重新用。純回答或 Owner 明確限定的非工程任務只核範圍，不藉此開始產品工程、全庫掃描或新排程。

## 執行規則

1. 讀 Owner 最新明確指令、現行批准 envelope、`PROJECT_STATUS.md` 與 [執行藍圖 v2.0](../../../docs/AI_Company_Growth_OS_執行藍圖_v1.md)。檔名雖含 v1，採文件中 v2.0 主線：**URL → First Useful Result → Review → Publish → Measure**。舊 HEAD、舊批准與過期 deadline 不取代現行指令；技能不是 DB、部署或費用的新授權。
2. 用一句可驗收的使用者結果定義當前 milestone，再選最小任務。每個候選標記一類，附「如何推進或阻塞這個結果」的證據：

   | 類型 | 定義與動作 |
   |---|---|
   | Core | 直接使主線某一步可用或完成目前核心驗收，優先执行。 |
   | Blocking | 有證據使目前核心 milestone 無法安全成立的依賴或缺陷；先解，再回同一 Core。 |
   | Maintenance | 維護、整理、工具或治理工作；限明確授權、必要且有界的範圍。 |
   | Deferred | 不影響目前 milestone 的改善；記 technical debt，回主線。 |

3. 嚴重度與任務類型分開。P0（嚴重安全／資料損失等）與 P1（核心流程失效）可阻塞；P2 僅有目前 milestone 必要性證據時阻塞；P3/P4 記 technical debt，**不得阻塞 milestone 或驗收**。未知嚴重度先做最小只讀判定，不自動升級為 P0/P1，也不為降級而忽略真實風險。
4. 不主動搜尋非阻塞問題。發現旁支問題只記位置、影響、嚴重度、延後原因及觸發重看條件，不新增平行修復工程。
5. 不連續執行超過 **2 個 Maintenance 任務**。在既有進度紀錄保留連續數，不用切小 commit 規避；第三個前必須回到已授權 Core 或有證據的 Blocking。若當前 Owner 只准文件／檢查，就完成該範圍並停止，不為滿足計數偷開產品工程。
6. 同問題最多 **2 次局部 patch**；第三次前先 RCA（重現、因果鏈、根因、最小根因修正與驗證），不再補表面症狀。**3 個相似問題已確認同 root cause → SYSTEMIC_FIX**，合併根因修正，避免三套 workaround。只改足以解除目前 blocker 的共同原因，不藉此重構全系統。
7. 每 **24 小時**必須有可核證的 `CoreMilestoneProgress`：使用者流程的新可用能力／已完成驗收及其證據。從既有紀錄查看最近24h，記 baseline、成果與下一個 Core；commit/test 數不能代替核心進度。commits/tests 很多但 `CoreProgress=0` 時標記 **PROJECT_DRIFT**，停止擴 maintenance、重新對齊主線。沒有證據就記0，不捏造進度；此規則不建立自動排程、不越權或突破安全暫停。
8. 完成標準是本次授權的核心流程／milestone 成立，有適當證據和限制說明，**不是全專案零 bug**。異常交給 [recovery-reconciliation](../recovery-reconciliation/SKILL.md)，實作驗收交給 [engineering-executor](../engineering-executor/SKILL.md)。

## 真人 checkpoint 與持續工程（Owner 2026-10-04 15:11 UTC）

日常 regression 必須以安全隔離 synthetic accounts／fixtures／test-only sessions 自動完成，不依賴 Owner 到場或 2FA。安全、權限或工具限制先判斷是否真人必需；`HUMAN_REQUIRED` 只阻擋直接依賴該確認的步驟，不停止獨立產品工程、tests、CI、Preview 或 docs，既有長期普通工程授權保留。不可把所有 synthetic 確認都推定為真人事項，也不可將測試 receipt 當 hosted 授權。

需本人僅限 Auth／callback／magic-link／OTP 本身改動、RC、重大 milestone 終驗、平台強制真人 challenge，以及不可代理的法律／授權／事實確認。RC／milestone 亦只要求其中人員必要步驟。真正到達該 checkpoint 才通知 Owner，列出確切版本的未解主張、為何必須本人、為何 fixture 不能替代、精確頁面及本人最小動作。曾遭工具拒絕不等於測試本質 HUMAN_REQUIRED，須分列 synthetic 測試、hosted 工具執行限制、不可代理真人確認三層。工具拒絕仍有效，不換 route 或代為確認；不擴 remote、費用或 production 權限、不做 production bypass。保持已完成安全收尾，remote restore 等仍需相應新批准；這不阻止不相依的已授權 repo/offline Core。

## Escalation

在既有 envelope 內自行分類與選題，普通維護取捨不重問 Owner。真正產品方向、重大架構、production破壞性變更、安全／資料損失、OAuth/2FA/secret、新費用、法律合規，或無法恢復的 systemic blocker 才升級。說明核心影響、已知／未知、既有證據及所需最小決策。Owner 明確指令優先於本技能，但不能凌駕平台安全；安全拒絕不得換 route 繞過。
