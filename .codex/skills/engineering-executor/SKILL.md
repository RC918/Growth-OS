---
name: engineering-executor
description: "Growth-OS 已授權工程的實作、測試、PR與驗收執行。Dot依mission-guardrail選定Core或必要Blocking任務後使用，Primary依Agentic Verification Loop驗證到可交付；問題先分類，僅修當前milestone的P0/P1或必要P2。不要用來啟動未授權產品工程、部署/DB操作、擴架構，或把Preview成功當產品驗收。"
---

# Engineering executor

## 何時使用／不應何時使用

在已授權工程範圍內執行最小Core任務及必要Blocking修復。先讀 [mission-guardrail](../mission-guardrail/SKILL.md)。Owner限定文件／技能／只讀檢查時只完成限定任務，不因本流程含「next Core」就開始產品工程；沒有授權的部署／DB／production操作亦不能自動啟動。

## 執行規則

1. **讀 milestone → 核對 Dot 選定的 Core task**：使用唯一v2.0主線及現行狀態，定義可見的before/after、驗收證據與批准邊界。保留工作目錄既有修改，不套用歷史HEAD指令，不擅自reset/stash/drop。
2. **Agentic Verification Loop**：依下節完整檢視各驗證點，做剛好滿足該結果的變更。用最小必要、可反駁結果的檢查；不以無關重構或重跑不變PASS填充工作量。缺工具／未驗收／未實作要精確記錄，不能報PASS。
3. **CLASSIFY → 必要 FIX → 重新 VERIFY**：讀實際錯誤／logs、判斷對當前 milestone 的影響；只有 P0/P1／必要 P2 才修 root cause，不把普通必要修復丟給 Owner。P3/P4 依 mission 記完整 Technical Debt，繼續 Core，不追到零問題。修正後從受影響的最早驗證點重新跑到 VERIFY，逐點記適用性；不重跑無關且仍有效的 PASS。阻塞或unknown操作套用 [recovery-reconciliation](../recovery-reconciliation/SKILL.md)；同問題最多2次局部patch，第三次前RCA，3相似同rootcause做SYSTEMIC_FIX。必要新測試應證明使用者結果或風險，不只鏡像實作。
4. **PASS → Commit／Push／PR**：核diff與scope，只提交本任務檔案；在既有授權下commit、nonforcepush目前branch、建立或更新指定PR，描述問題、結果、驗證與限制。保留frozen artifact/hash及不在範圍內的runtime flags。GitHub403不blind retry；若已明確由父connector處理，提供可直接採用的PR更新文字並交父，繼續完成不受影響的工作。
5. **CI／Preview → VERIFY／交審證據**：對應完整HEAD、CI run/job/step與Preview deployment身份；讀實際logs，fail 先 CLASSIFY，只修阻塞當前 milestone 的 P0/P1／必要 P2，再按驗證迴圈重驗，不重複無因 rerun。Preview build／部署ready不能替代Auth、互動、資料持久或產品結果驗收；synthetic/local證據不得報成live驗收。涉及部署／登入／Save等只在既有明確envelope中執行；被平台安全拒絕即走合規恢復，不改route。
6. **VERIFY → 既有 Reviewer → Dot 選下一工作**：當前使用者流程與必要安全條件成立即整理可交付結果，不以零問題為門檻。Primary 必交既有 Reviewer：exact HEAD／scope、逐點適用性與證據、CI／Preview、限制與 Technical Debt；Primary 的 VERIFY 不是最終驗收，不自行宣告 APPROVE 或新建 Reviewer。依 Reviewer 裁決處理必要問題，下一工作由 Dot 選定；只做當次授權範圍。
7. 以CoreMilestoneProgress衡量進度，遵守不連續超2Maintenance及24h核心進度檢查；多commit／多test但CoreProgress0標PROJECT_DRIFT並對齊主線。不新增未要求的Cloud task、背景排程或產品任務。

## Agentic Verification Loop

每個 Core 使用同一迴圈；此處是唯一完整流程定義，AGENTS／mission／recovery 引用，不另建平行流程或框架：

**PLAN → CODE → UNIT / CONTRACT TEST → BUILD / RUN → BROWSER / DOM CHECK → DESKTOP + MOBILE E2E → 必要 DATABASE / AUTH CHECK → SAVE → LOGOUT → FRESH SESSION → LOGIN → READBACK → TENANT / PERMISSION CHECK → VERIFY**。

- PLAN 記 Dot 選定的使用者結果、必要安全條件、批准範圍與驗收方式；CODE 只補該結果的缺口。
- 按當次變更逐點記錄「適用／不適用及原因」、實際結果與可核查證據（命令／logs、版本、UI／DOM、保存／讀回身份與資料、tenant／permission等）；不適用不是 PASS，未執行／未知／工具限制須如實標示。沿用既有 status／驗收紀錄，不增加必填產品操作或治理系統。
- BUILD / RUN 必須驗實際可執行路徑；無對應 build script 時明列不適用，不拿 Preview echo build 代替。瀏覽器／桌面手機與必要 DB／Auth 檢查依變更範圍驗核心行為；保存流程須核 SAVE 到 READBACK 的 exact version／payload及權限，fresh session 不可沿用舊 context／token／storage 假裝重新登入。
- 日常採安全隔離 synthetic accounts／fixtures／test-only sessions，證據與真 Auth／hosted／真人驗收分列。迴圈不是新授權，不能為跑完整流程執行未批准的 hosted mutation、登入、restore、模型或付費；真人觸發及必要性沿用下節，只阻擋直接相依步驟。
- 遇問題先 CLASSIFY；必要 FIX 後從受影響的最早驗證點重新跑到 VERIFY。後續每點仍須說明適用性／證據或有效既有覆蓋，不能只驗局部 patch 就宣稱整體通過。P3/P4 記完整 Technical Debt 後繼續原 Core；原同根因 RCA／SYSTEMIC_FIX 規則不變。
- VERIFY 核對當前使用者流程與必要安全條件、未解限制及證據完整性，形成交付包；**必交既有 Reviewer，Primary 不自行最終驗收**。

## 真人 checkpoint 與持續工程（Owner 2026-10-04 15:11 UTC）

日常 regression 必須以安全隔離 synthetic accounts／fixtures／test-only sessions 自動完成，不依賴 Owner 到場或 2FA。安全、權限或工具限制先判斷是否真人必需；`HUMAN_REQUIRED` 只阻擋直接依賴該確認的步驟，不停止獨立產品工程、tests、CI、Preview 或 docs，既有長期普通工程授權保留。不可把所有 synthetic 確認都推定為真人事項，也不可將測試 receipt 當 hosted 授權。

需本人僅限 Auth／callback／magic-link／OTP 本身改動、RC、重大 milestone 終驗、平台強制真人 challenge，以及不可代理的法律／授權／事實確認。RC／milestone 亦只要求其中人員必要步驟。真正到達該 checkpoint 才通知 Owner，列出確切版本的未解主張、為何必須本人、為何 fixture 不能替代、精確頁面及本人最小動作。曾遭工具拒絕不等於測試本質 HUMAN_REQUIRED，須分列 synthetic 測試、hosted 工具執行限制、不可代理真人確認三層。工具拒絕仍有效，不換 route 或代為確認；不擴 remote、費用或 production 權限、不做 production bypass。保持已完成安全收尾，remote restore 等仍需相應新批准；這不阻止不相依的已授權 repo/offline Core。

## Escalation

只將需要Owner判斷的產品方向、重大架構、production破壞性操作、安全／資料損失、OAuth/2FA/secret、新費用、法律合規、無法恢復的systemic blocker升級；先完成可安全執行的已授權工作，提出具體證據及最小決策。普通工程問題按 CLASSIFY 與必要 FIX 規則自主處理，不擴修非阻塞問題。Owner明確指令優先於本技能，平台安全仍優先；任何技能不授權繞過拒絕、洩露secret、越過截止或擴大批准。
