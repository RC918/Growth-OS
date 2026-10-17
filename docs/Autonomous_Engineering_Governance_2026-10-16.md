# Growth OS｜自治工程治理 2026-10-16

本文件把執行模式改為「預先授權、隔離執行、持續驗證、例外升級」，補充而非取代 Growth OS v2.0、AGENTS.md 與 repo Skills。產品目標與正式環境安全邊界不變。

## 分級授權矩陣
| 級別 | 範圍 | 決策者 | 證據要求 |
|---|---|---|---|
| L0 唯讀 | 狀態查詢、測試、CI/Reviewer 讀取、證據整理 | Muse 自主 | 指令與輸出紀錄 |
| L1 隔離工程 | 接管分支改碼、修復、Commit、推送該分支、Draft PR、安排 Reviewer | Muse 自主（工具權限內） | Diff、測試、CI、Reviewer 綁定 Commit |
| L2 受控試運行 | 10 分鐘 Watchdog、Checkpoint 恢復、唯讀/合成任務（單輪一項、上限 60 分、試行期限內） | 已預先授權，例外才升級 | Patrol 日誌、到期與鎖紀錄 |
| L3 高風險 | 正式部署、正式 DB、Secrets、Billing、Force Push、PR Merge、破壞性 Migration、新增付費服務 | Owner 逐項核准 | 明確核准紀錄與回滾方案 |

## Muse 可自主執行（L0–L2）
在授權分支內規劃與選題、修改產品或測試程式、執行限時測試與失敗修復、建立 Commit、推送授權分支、建立或更新 Draft PR、單次查詢 CI、安排獨立 Reviewer 並依其裁決修復、寫 Checkpoint 與技術債、Watchdog 巡檢與安全恢復。平台 Sandbox/Approval 照常運作，不以提示詞繞過。

## 必須升級 Owner 的例外
L3 全部事項；需要真人 Auth/2FA/OTP 驗證本身；產品方向或重大架構變更；Reviewer 連續失敗且任務被 REVIEW_BLOCKED 阻斷其他相依工作；Checkpoint 損毀、鎖異常、未知權限請求；任何可能造成資料損毀、重複執行、權限越界或不可恢復的缺陷。一般改善只記技術債，不阻斷產品開發；停止無限追加 Controller 功能，除非符合前述四類風險。

## Reviewer 與阻塞規則
Reviewer 必須與 Coder 不同會話、唯讀、裁決綁定當前 Commit SHA。失敗自動有限重試（上限 2 次）；仍失敗標 REVIEW_BLOCKED 並繼續不相依工作，Primary 不得自批。Watchdog 每 10 分鐘輕量巡檢，事件可立即觸發；無任務不呼叫模型，429 等待重置，單一 Coder 不重疊。

## PR #31 過渡到真實工程任務的最短路徑
1. PR #31 最新 HEAD 的 CI 全綠與 Reviewer APPROVE 齊備（治理文件併入後重取）。
2. 完成 24 小時受控巡檢或由 Owner 書面豁免剩餘時數。
3. 選定第一項真實低風險任務：優先 W1 登入診斷證據補齊或真實 URL 鏈的非破壞性修復（限接管分支、合成/唯讀證據先行）。
4. 走完 PLAN→CODE→TEST→CI→REVIEW→Draft PR→Checkpoint，並產出下一項任務建議，不自行合併。

## 真實交付驗收標準
一項自主工程任務視為完成，須同時具備：實際產品或測試程式的 Commit（非僅文件或合成流程）、對應測試在本機與 CI 通過、獨立 Reviewer 對該 Commit 的 APPROVE、Draft PR 含變更與證據說明、Checkpoint 可由新會話接續、同任務不重複執行紀錄。合成測試、離線 PASS 或流程演練不得單獨宣稱為真實工程成果。
