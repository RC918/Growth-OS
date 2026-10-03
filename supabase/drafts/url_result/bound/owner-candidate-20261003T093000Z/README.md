# 09:30 UTC 重綁包：Owner 已批准範圍／截止，尚待安全 preflight

固定截止 **2026-10-03T09:30:00.000Z（台北17:30）**，不自動延展。父轉述 Owner `Sentinel_c3d152ee5d2c8191b21435b958764e1c` 於 08:53:10 UTC 回覆「同意」父 08:05 的同範圍改期提問；完整批准來源與固定 manifest 見 [approval-manifest.json](approval-manifest.json)。沿 accepted package `4525a90112970457848f4c5c8b2d347ae878fd6e` 使用同一 generator，08:00 過期包原樣保留。

唯一 artifact 變化是 literal 截止由 08:00 重綁 09:30（opening 與 open/closed config 的相應 hashes 改變）；cleanup、actor/org/new parent/request/expected 0、frozen payload/source/content/request hashes、既有 Preview URL 完全相同。生成 SQL/config 的原有「candidate／not approved」註解是未改動 generator 的模板文字；批准狀態以本 manifest 記錄為準，不表示本輪已套用。

Supabase 僅 `vhzryhibmpvglzcmfnaa`。既有 Preview／repo 導出的 Auth redirect 均為 <https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html>；沒有 `/auth/callback.html` 路由變更。遠端 allowlist／安全 handoff 未由本離線工作核對。父另外處理已獲准的安全 browser/auth preflight；**成功前不開 grant，無安全 handoff 就停**，不要求貼 secret 或替代 backend JWT。

範圍維持兩 migration **19→20→21**、**2 次既有登入＋1 POST**、固定 scope/hash/絕對截止的 Save；持久最多新增 **1 parent／1 version／1 audit**，保留原資料／private ledger。未知只 GET、不 retry POST，同受控 tab 的 sessionStorage attempt/known UUID 不因 reload/relogin/cleanup/expiry 清除。收尾撤銷 Save grant 並核 effective ACL 關閉，成果與讀取能力保留；到期不是省略 cleanup 的理由。

父獨立驗包及成功 preflight 後，若另行指示套用 config，唯一目標是 `apps/web/url-result-config.mjs` 與 `prototype/owner-workspace/url-result-config.mjs`：開用本目錄 `preview-open-config.mjs`，關用 `preview-closed-config.mjs`（schema=true/save=false/同 trial）。**本輪兩實際 config 仍 false/false/null**；只做離線生成／hash一致性檢查／docs／commit／非強制 push，未做 remote、grant、部署、登入或 Save。
