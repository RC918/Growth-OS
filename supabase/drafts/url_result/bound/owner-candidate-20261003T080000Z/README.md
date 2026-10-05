# 供 Owner 批准的具體候選：尚未批准、未執行

固定截止 **2026-10-03T08:00:00.000Z（台北 16:00）**，不自動延展。若 Owner 未及時批准，不執行、不更改 deadline。完整固定 IDs、hashes 與操作邊界見 [approval-manifest.json](approval-manifest.json)。本目錄不在 migrations 自動部署路徑或 `apps/web` served root。

既有 Preview：<https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html>。Supabase 僅 `vhzryhibmpvglzcmfnaa`。repo `workspace.mjs:476` 傳入 `${location.origin}${location.pathname}`；`workspace-api.mjs:96` 僅接受同源 HTTPS `/workspace.html`，因此程式導出的登入 redirect URL 就是上述 workspace URL。repo 沒有使用 `/auth/callback.html`；先前 callback 假設已更正。**遠端 allowlist、實際 alias 與安全登入 handoff 尚未核對，不能當作已可用。**

父回報雲端瀏覽器能力讀取遭安全審核拒絕；本輪未重試、未改 route。須待 Owner 批准瀏覽器檢查／登入，再做安全 preflight；沒有安全 handoff 就停止。**preflight 成功之前不得開 grant。** 不要求貼 secret，不使用替代 backend JWT，不新增帳號／org／membership／redirect。

待批准的最小範圍是：兩份 migration（history **19→20→21**）、**2 次既有登入＋1 次 Save POST**、既有受控 tab 的唯讀 GET 核對。opening 只向 authenticated 開既有 URL Save public/private 兩 entry；固定 owner/org/new parent/request/expected 0/payload/hash/absolute deadline 均在既有 private impl 強制。最多持久新增 **1 parent／1 version／1 audit**；原 business 資料與 private ledger 保留。結果未知只 GET、不重試 POST；reload/relogin 保留 bounded sessionStorage attempted/known UUID 標記。收尾 cleanup 關閉 grant／驗 effective ACL，保留三筆成果與唯讀存取，亦保留 bounded function body。

批准後才可套用的 config 最小變更位置：

| 階段 | 候選來源 | 唯二目標檔 | 值 |
|---|---|---|---|
| 開放 | `preview-open-config.mjs` | `apps/web/url-result-config.mjs`、`prototype/owner-workspace/url-result-config.mjs` | schema=true、save=true、trial=本候選固定物件 |
| 收尾 | `preview-closed-config.mjs` | 同上 | schema=true、save=false、同一 trial（不清標記） |

本輪沒有套用上述變更；實際兩份 config 仍 schema=false／save=false／trial=null。生成檔中的 open config 與 SQL grant 都只是待批准候選，cleanup 原有註解也不構成批准。不得在 schema migration 前套用 schema=true，也不得在安全 preflight 與 Owner 批准前開啟 SQL grant 或 save flag。UTC 到期會硬拒絕 Save，但不能省略 cleanup。

已驗收程式基準 `cffdec89c30faaad523cb3af1a64108e335d3b92`：父核 push CI 37104398407／PR CI 37104401072 各 45 steps 成功，含 Chromium145 兩 viewport unknown／ack UUID＋空 GET、same-tab reload/relogin GET-only、marker fail-closed 與 PG17.6 native gate。本輪只重新生成精確候選並檢查逐 byte 一致、hash、固定輸入、closed flags；未重跑不變測試、未執行任何遠端操作。
