# Growth OS｜Muse 工程控制器（原型）2026-10-16

狀態：原型，未啟用無人值守排程。Owner 核准前僅手動觸發。

## 迴圈（每輪上限：1 任務、重試 2 次、單項測試限時、總時限 60 分）
1. READ：fetch 後讀鏈尖、AGENTS.md、mission/engineering skills、接管紀錄；已完成任務依 commit/PR 去重，不重建 branch/PR。
2. SELECT：僅選已授權、非破壞性、可離線驗證的最小 Core/必要 P2；P0/P1 才自動修，P3/P4 只記 debt。
3. CODE：Coder 在 takeover 分支實作（最小 diff）。
4. TEST：拆小獨立限時執行，記錄 PASS/FAIL/BLOCKED 與 exit code；一項阻塞不取消其他項。
5. REVIEW：交獨立唯讀 Reviewer（子代理，僅讀 diff/證據）；啟動失敗或逾時記 REVIEW_BLOCKED，不自批。
6. PUBLISH：commit + push takeover 分支 + 更新 Draft PR；禁止 merge/force/deploy。
7. CHECKPOINT：每步寫入本檔或接管紀錄（HEAD、測試、阻塞、下一步）；遇 429/斷線先落 checkpoint 再停，不無限重試。

## 已實測限制
- 子代理曾以 runtime_turn_task_lost 失敗（執行期遺失，非程式錯誤）；需小任務、短回覆、失敗即標 BLOCKED。
- muse exec 在目前沙箱因無法讀 ~/.config/muse 與建立 session lock 而失敗，屬沙箱檔案權限，非訂閱認證結論；不在沙箱外重試、不切付費 API。
- 排程（cron）與跨會話訊息工具存在但目前無已排工作/peer；啟用排程需 Owner 核准。

## 可執行原型（2026-10-16 後續）
- 原始碼：tools/controller/controller.mjs；合成測試：tools/controller/controller.test.mjs（node --test，8 項全 PASS，exit 0）。
- 使用方式：以注入的 code/test/review 工具建立 Controller，狀態寫入指定目錄的 state.json（每步 checkpoint），lock 檔防止並行，id+commit 去重，重試上限 2。
- 恢復證據：中斷恢復情境以新 Controller 實例讀回同一 state 目錄，已完成任務回 deduped 且不重跑（測試 PASS）。
- PR #31 單次查詢（不輪詢）：HEAD b209d55，Vercel PASS、兩組 test PENDING，已記錄不阻塞。
- 後續：新增 adapters.mjs（CI 單次查詢、永不 watch；PENDING 不阻塞）與 adapters.test.mjs；Controller 測試合計 11 項 PASS。PR #31 單次查詢：Vercel PASS、test PENDING（記錄後繼續，不等待）。
- 強化（P1/P2）：階段 code/test/ci/review 獨立恢復、Checkpoint 原子寫入（tmp+rename）、損毀停機不覆蓋、Lock 建目錄後取得且 60s 過期回收、Reviewer 裁決綁定 commit 且須異會話+completed、CI 改用 Check Runs 結構化結果對應 HEAD。失敗注入測試 10 項 PASS（429 上限、損毀、舊 Lock、混合 CI、過期裁決、去重、階段接續）。
- 最終安全補強：租約式 Lock（owner/PID/runId/到期+心跳，僅回收已失效且過期持有者，舊持有者不刪新 Lock）、429 保存 Retry-After/reset 與 waitUntil（Watchdog 到期前不呼叫、重啟不丟進度）、Coder 後以實際 gitHead 輸出 SHA 綁定 test/CI/Review 證據（新 Commit 使舊證據失效）、Reviewer 須 independent-reviewer 來源+異會話+SHA 相符+completed、CI Check Runs 分頁/重跑/缺失與非 success 不判綠。失敗注入 8 項 PASS。
- Loop v2：執行 Loop 擴為 plan/code/test/build/e2e/dbauth/review/preview/verify 九階段（證據綁 outputSha、審計紀錄），Watchdog 原型 tools/controller/watchdog.mjs（單次 tick、事件 onEvent 立即觸發、BLOCKED 繞行、僅重大事項通知；排程未啟用）。合成驗證 7 項 PASS：完整循環、CI 延遲接續（code 不重做）、429 等待、Reviewer 失敗有限重試、中止恢復、Watchdog 繞行+事件觸發、損毀停機與 CI 不誤綠。
- 恢復與串接驗證：Payload 已持久化於 Checkpoint 並於重啟無參數接續時恢復（測試 PASS）；Heartbeat 於長階段保持租約（測試 PASS）；真實 Git Adapter 讀得實際 HEAD/乾淨狀態（測試 PASS）；真實 CI Adapter 經 Node 子程序呼叫 gh 時遭沙箱網路阻擋，回 BLOCKED（fail-closed，未判綠），同查詢經 shell 單次執行得 test in_progress（即 PENDING 語意）。合計測試 11 項 PASS。
- 最終串接驗證：Watchdog 恢復保留原始 payload/任務參數（Checkpoint 恢復，測試 PASS）、Watchdog 與 Controller 共用同一時鐘確保 429 重置前不重試、心跳續租與舊持有者解鎖競態、每項真實工具呼叫加上限時（TOOL_TIMEOUT 落紀錄）。測試合計 15 項 PASS。本機 HEAD 與遠端相差一筆未推送提交，待授權後單一推送。
