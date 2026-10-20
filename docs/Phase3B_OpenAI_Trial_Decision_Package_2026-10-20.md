# Phase 3B 真實 OpenAI SEO／GEO 小額試驗決策包（2026-10-20）

狀態：**準備完成，未啟用**。本文件不授權任何真實 API 呼叫；
正式 transport 預設停用（`LIVE_TRANSPORT_DISABLED`），需 Owner
另行確認才可啟用。本輪零真實呼叫、零費用。

## 1. 官方模型與計價依據（2026-10-20 查證）

- 模型：`gpt-5-mini`，快照 `gpt-5-mini-2025-08-07`；支援
  Responses API 與 structured outputs，文字輸入／輸出。
  來源：https://developers.openai.com/api/docs/models/gpt-5-mini
- 計價：輸入 US$0.25／1M tokens、快取輸入 US$0.025、
  輸出 US$2.00／1M tokens。
- 供應商限制分兩層：spend alert 僅通知、不停流量；org／project
  hard spend limit 達額回 429（`*_spend_limit_exceeded`），但
  官方明示執行非即時、可能小幅超額。另有 OpenAI 指派的
  usage tier 月上限，與自設 spend limit 分開。
  來源：https://developers.openai.com/api/docs/guides/spend-limits
- 因此 US$5 分兩層落實：應用軟性上限（本機 ledger 先擋）＋
  供應商硬性上限（專案 hard limit US$5）。不得只靠軟性上限
  宣稱硬性保證；預付餘額本身亦構成硬性天花板。

## 2. 預計請求數、token 上限與成本估算

- 案例：3 個 Fixture × 2 語言（繁中、英文）＝ 6 次生成。
- 每請求上限：輸入 2,000 tokens、輸出 1,000 tokens（程式閘門）。
- 試驗總上限：最多 12 次請求、總額 US$5（程式閘門先擋）。
- 單次成本上限估算：2,000×0.25/1M ＋ 1,000×2.00/1M
  ＝ US$0.0025；6 次約 US$0.015，12 次上限約 US$0.03。
- 實際成本以 API 回傳 usage 記帳；超過程式上限即停止並
  FAIL_CLOSED，不以估算值冒充實際帳務，帳務端另以專案
  usage 頁對帳。

## 3. 憑證正式接入路徑（Owner 一次操作）

1. 於 OpenAI Platform 建立專用隔離專案（例如
   `growth-os-phase3b-trial`），不與其他用途共用。
2. 於專案 Limits 設定 Monthly spend limit = US$5 並開啟
   **Enforce a hard limit**；另設 US$1、US$3 spend alert。
3. 建立僅屬該專案的 API Key；金鑰只存放在執行主機的
   官方支援位置（環境變數或秘密管理服務），由
   `credentialProvider` 注入 transport。
4. 金鑰不得貼入聊天、終端輸出、程式碼、GitHub、Checkpoint
   或日誌；本 repo 不保存任何金鑰。
   依據：官方 production best practices（金鑰以環境變數／
   秘密管理服務提供，不寫入程式碼或公開 repo）。

## 4. US$5 試驗預算控制方案

- 預檢：每次呼叫前以 `estimateCost` 估算並檢查剩餘額度、
  請求數與 token 上限（`createTrialBudget`）。
- 記帳：每次成功回應以實際 usage 記入 ledger；總額超限
  立即標記 stopped。
- 停止開關：transport 預設停用；啟用需同時滿足
  `enabled=true`、credentialProvider、fetch 與 budget 四項，
  缺一即拒絕。`budget.stop()` 或供應商 spend-limit 429
  觸發後不再呼叫。
- 人工急停：刪除專案金鑰或關閉專案 hard limit 即全停；
  本機停止只需移除啟用旗標。

## 5. 測試案例與品質評分規則

- Fixture：`prototype/ai-seo/fixtures/phase3b-cases.json`
  （Landyachtz The Clark、WooCommerce BIC00001、衝突負例）。
  正例事實綁定真實快照引用（id→locator＋quote），由
  `validateFixtureBindings` 驗證：引用不存在、值不受引用
  支持、UNKNOWN 帶引用皆拒絕；負例明示 synthetic。
  Landy 為真實快照 `c98f512d…ab57`（meta 為 UNKNOWN）；
  Woo 依 2026-10-17 一致性驗收錄（meta 同為 UNKNOWN）。
- 產出：SEO Title、Meta description、商品描述、GEO 問答，
  各附 `used_fact_ids` 與來源引用。
- 機器閘門（`quality-eval.mjs`，非品質分數）：事實詞元可
  追溯、引用覆蓋、UNKNOWN 保留、衝突未解不得宣稱確定；
  未通過即 FAIL_CLOSED。
- 人工評分（每項 0–2 分，總分 8；須附逐項理由）：
  可讀性、搜尋意圖符合、相對原文改善價值、語言自然度。
  通過門檻：機器閘門全過，且人工總分 ≥6、任一項不得 0。
- AI 自評分數不列為品質證據；第三方文案不對外發布。

## 6. 異常與停止程序

- 逾時／中止：可能已被計費且 Responses API 無冪等鍵，
  故不自動重試，標記 UNKNOWN_OUTCOME，先對帳再決定。
- 429 spend limit：立即停止試驗，不重試，等待 Owner 決策。
- 429 rate limit／5xx：最多重試 1 次並尊重 Retry-After，
  仍受請求與預算上限約束。
- 其他 4xx：視為請求錯誤，不重試。
- 部分成功：以案例為單位記帳；失敗案例不連帶重跑已成功
  案例，重跑須以新請求計入 12 次上限。
- 驗證失敗（捏造事實／衝突誤述）：該案例 FAIL_CLOSED，
  不人工放寬；若 3 案例中任一正例捏造事實，整批品質
  驗收不通過並停止，不擴大試驗。

## 7. CI、Reviewer 與回復證據

- 離線測試：`openai-live-gate`、`quality-eval`、既有
  ai-seo 管線與 Phase 3A 流程回歸共 24/24（本輪本機）。
- 本決策包提交經 GitHub CI 與 Workflow 獨立 Reviewer
  審核；證據僅記於該次提交，不再逐輪追加 Checkpoint。
- 回復：本輪全部為新增隔離工件與一處非凍結管線詞元
  修正；刪除新增檔案或還原該修正即完全回復，不影響
  Phase 1～3A 已驗收行為。

## 8. Owner 啟用決策（唯一待確認事項）

啟用前須 Owner 一次確認以下三項，缺一不啟用：

1. 已建立專用專案並完成第 3 節的 US$5 hard limit 與
   US$1／US$3 alert 設定（不需提供任何金鑰內容）。
2. 金鑰已以官方方式存放在執行主機（環境變數或秘密
   管理），可由本機程序讀取（不需貼入聊天）。
3. 同意以 `gpt-5-mini` 快照執行最多 12 次、總額以
   US$5 為雙層上限的一次性試驗，結果僅供品質驗收、
   不對外發布。

確認後執行順序：離線乾跑（注入替身）→ 1 次真實呼叫
→ 機器閘門＋記帳核對 → 其餘 5 次 → 人工評分 → 交付
品質報告。全程維持 PR #31 Draft，不操作 Production、
不接入 GSC、不建立常駐 WordPress 站。
