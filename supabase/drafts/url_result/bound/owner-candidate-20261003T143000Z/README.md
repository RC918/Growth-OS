# 14:30 UTC 離線重綁包

父轉述 Owner 2026-10-03 **13:18 UTC** 明確批准同固定資料限時驗收，截止 **2026-10-03T14:30:00.000Z（台北22:30）**，不自動延展。合法 package 基準 `0614100535175c0109d9d4f964d96629002af219`。批准來源、固定 IDs、payload/hash、操作限制見 [approval-manifest.json](approval-manifest.json)。08:00／09:30 歷史包完整保留。

使用同一已驗 generator，只有 opening／open config／closed config 的 literal deadline 由09:30改為14:30，cleanup SQL bytes 完全相同。actor/org/parent/request/expected 0、frozen payload/source/content/request hashes 與 Preview URL 全不變。原 generator 的 candidate／not-approved 註解保留；本 manifest 記錄父轉述的批准，不代表已執行。

Supabase 僅 `vhzryhibmpvglzcmfnaa`；既有 Preview 及 repo 導出的 Auth redirect 是 <https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html>。父確認雲端現有登入成功，但 allowlist 仍待唯讀核對；本離線工作沒有做 remote preflight。沒有安全 handoff 就停止，不要求貼 secret，不用替代 backend JWT。

後續僅由父處理：readonly preflight（含 allowlist）成功 → opening migration → open config 部署 → new login 1 → 最多1 Save POST → 立即 cleanup＋closed config 部署 → new login 2 只讀取回。兩 migration history 19→20→21，2次既有登入，最多持久1 parent／1 version／1 audit；原資料及 private ledger 保留。未知結果只 GET、不 retry POST；same-tab attempted/known UUID marker 保留。到期不得開放或 Save，也不自動延展；若已 opening，仍須 cleanup。

若父另行指示套用 runtime config，開／關候選來源分別是本目錄 `preview-open-config.mjs`／`preview-closed-config.mjs`，目標僅 `apps/web/url-result-config.mjs` 及 `prototype/owner-workspace/url-result-config.mjs`。**本輪沒有套用或部署，兩份實際 config 仍 false/false/null。** 本輪只生成候選、最小一致性／hash驗證、必要文件、commit／非強制push；不做 remote DB/Auth/browser/login/Save/ACL，不重跑不變的全套PASS。
