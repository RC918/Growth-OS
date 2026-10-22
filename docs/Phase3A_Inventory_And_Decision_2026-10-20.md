# Phase 3A｜能力盤點與真實模型／試點決策包（2026-10-20）

## P0 能力矩陣

| 能力 | 狀態 | 依據 |
|---|---|---|
| First Result 事實／引用契約 | 已實作 | frozen 驗證、adapter、Staging 驗收 |
| Adapter Registry | 原型 | 非凍結 registry＋契約測試 |
| AI／LLM 接入 | 只有替身 | intro-trial 離線 handler、policy 預算形狀；未連真實模型 |
| SEO／GEO 生成 | 本輪新增原型 | `prototype/ai-seo/` 注入式管線 |
| 自治任務／排程 | 已有 Controller | `tools/controller/` 與 10 分鐘 Loop |
| 例外升級 | 已實作 | Loop 規則與 NEED_OWNER 流程 |
| Workspace／引導介面 | 已實作＋原型 | Phase 1 正式介面、2A／3A 引導原型 |
| 真實模型付費調用 | 尚未實作 | 需 Owner 決策（見下） |
| 試點網站 AI 優化實測 | 尚未實作 | 需試點與發布授權 |

## 本輪交付（隔離、無真實模型）

- AI SEO／GEO 管線 `prototype/ai-seo/ai-seo-pipeline.mjs`：
  快照事實 → 市場／語言 → 注入模型建議 → 事實驗證 →
  人工 Review。中英雙語測試、捏造價格 fail closed、
  UNKNOWN 保留、成本帳本與預算阻斷，共 3/3 PASS。
- Growth Engine `prototype/growth-engine/engine.mjs`：
  狀態機、分級授權、人工核准閘門、重試上限、冪等、
  預算上限、失敗升級與稽核日誌，共 4/4 PASS。
  僅注入式隔離執行器，不是第二套正式 Controller。
- 引導原型 `prototype/phase3a-guide/index.html`：
  網址 → 分析 → 市場／語言 → AI 優化 → 自治任務 →
  Review → Publish Preview → Measure，不連線、不發布。

## 下一階段決策包（待 Owner 核准）

**A. 真實模型接入**

- 建議：選一個模型供應商，以單一隔離試點調用，
  每次調用前顯示預估成本、每月上限與停止開關。
- 需要：Owner 指定供應商與預算上限，並以平台正式方式
  提供憑證（不經聊天貼出）。
- 不核准影響：AI 優化維持替身驗證，無法產生真實建議品質證據。

**B. 試點網站**

- 建議：以 Owner 自有、低風險的一頁產品頁做單次試點，
  只產生建議與 Preview，不直接發布。
- 需要：精確網址、目標市場／語言、是否允許後續發布。
- 不核准影響：只能以錄製頁面與合成內容驗證。

兩項可分別核准；核准後 Muse 可自主完成接入、隔離
實測、CI／Reviewer 與成本報告。正式發布與 Production
不在本決策範圍。
