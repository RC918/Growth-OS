# M2 計畫／工作卡離線契約

2026-10-02（台北）。依執行藍圖 M2 最小下一項，沿用現有已確認目標及不可覆寫問答，不新增資料庫或正式接線。

## 已實作與證據

`apps/web/growth-plan-contract.mjs` 提供純函式 create／inspect／revise／approve／transition。只接受完整已確認目標，綁定 organization、goal、目標版本與完整歷史 fingerprint。每張卡包含交付物、缺資料、來源 turn 與逐字引用、先行依賴。卡片依拓撲順序輸入，拒絕循環、外部依賴與錯誤引用。owner 可修改，viewer/editor 可讀；這是呼叫端契約，不能代替遠端 Auth/RLS。

計畫修訂建立新版本，保留輸入舊版本、清除所有核准、工作狀態與結果。核准綁定版本及卡片內容；任何內容漂移拒絕沿用核准。stateRevision 在核准、修訂與工作狀態更新時遞增，工作更新須精確匹配當前 revision。狀態為 draft → ready → running → completed/failed，failed 可明確重試；依賴須已完成。完成需要結果位置／紀錄、失敗需要原因；這些值是呼叫者聲明，不代表系統核實或外部發布。published 固定 false。

驗證：`node --test prototype/owner-workspace/growth-plan-contract.test.mjs`，13 項 PASS；`node --check apps/web/growth-plan-contract.mjs` PASS；`git diff --check` PASS。核准內容漂移與舊 stateRevision 覆蓋兩項測試在修正前 FAIL、修正後 PASS。CI 新增相同契約測試步驟；同 SHA 遠端結果以 PR checks 為準。

## 尚未完成

純函式回傳副本，尚無版本集合、工作台入口、資料庫保存、跨登入讀回、遠端租戶驗收、模型生成或發布。fingerprint 是內容一致性欄位，並非簽章或 Auth；JSON 或呼叫端角色可被修改，可信服務端必須重新驗證 membership、版本和核准。不能宣稱完整 M2 或自然語言 M1 完成。

下一項：提供明示 memory-only 的版本 session，保留舊計畫版本及狀態事件，處理取消／登出／目標切換與版本衝突，再做離線操作介面。真實持久化與 Auth/RLS 整合另需增量 schema/API 設計與验收。
