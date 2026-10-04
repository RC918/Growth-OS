# Growth-OS 工作總則

- 唯一產品主線是 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)：URL → First Useful Result → Review → Publish → Measure。
- `AGENTS.md`＋repo `SKILL.md` 為正式治理來源；每個 Core task 開始前依序直接讀本檔 → [mission-guardrail](.codex/skills/mission-guardrail/SKILL.md) → [engineering-executor](.codex/skills/engineering-executor/SKILL.md)，異常再讀 [recovery-reconciliation](.codex/skills/recovery-reconciliation/SKILL.md)。`skills.list` 空不阻塞，也不觸發環境維修。
- Owner 2026-10-04 核定內部順序：①URL 到編輯／保存／新 session 取回／確切版確認核心可靠→②執行端受控站單平台授權／發布／讀回／恢復→③版本／頁／發布時間／基線／後續量測→④Owner 自有真內容且開放搜尋站試點→⑤修正後外部商家。外部商家不是目前前提；具體門檻只引用唯一藍圖，不自行延伸 CSV 支線。方向不授權改 Owner 既有站、帳密、外部授權或費用。
- Dot 選工作；Primary 將選定 Core 依 [Agentic Verification Loop](.codex/skills/engineering-executor/SKILL.md#agentic-verification-loop) 驗證到可交付，逐點列適用性及證據。VERIFY 後必交既有 Reviewer，Primary 不自行最終驗收或選開下一 Core。
- 問題先 CLASSIFY：只有當前 milestone 的 P0/P1／必要 P2 才 FIX，從受影響的最早驗證點重新跑到 VERIFY；P3/P4 記完整 Technical Debt，不阻止 Core，不一路修到底。完成以當前使用者流程與必要安全條件成立為準，不以零問題為門檻。
- Owner最新明確指令優先於repo技能；技能不擴大授權，也不能凌駕平台安全、期限或安全拒絕。限定文件／只讀任務完成後停止，不自動啟動產品工程。
- 日常 regression 必須用安全隔離的 synthetic accounts／fixtures／test-only sessions 自動完成，不依賴 Owner。安全／權限／工具限制先判是否真人必需；`HUMAN_REQUIRED` 只阻擋直接相依步驟，獨立工程、tests、CI、Preview、docs 繼續，既有普通工程授權不撤回。
- 需本人僅限 Auth／callback／magic-link／OTP 本身改動、RC、重大 milestone 終驗、平台強制真人 challenge、不可代理的法律／授權／事實確認；RC／milestone 亦只限人員必要步驟；請人前須列確切版本未解主張、本人必要性、fixture 無法替代的原因、精確頁面及最小動作。synthetic 測試、hosted 工具執行限制、不可代理真人確認分層，工具拒絕本身不等於 HUMAN_REQUIRED。不繞過工具拒絕、不擴 remote／費用授權、不做 production bypass。
