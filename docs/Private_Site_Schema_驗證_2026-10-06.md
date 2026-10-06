# 新專案非 RC schema／RLS／Save–Review 候選驗證

## 當前 Core 與範圍

父核 PR24 `feat/private-site-wiring`／`3cc7d84776de88f7e5f480426369353735ac9ae1` APPROVE_WITH_DEFERRED_DEBT 後，指定本獨立 stacked `feat/private-site-schema`。Before：私有接線仍缺可批准的新空專案 business schema；After：有不含 RC identities 的 exact SQL／ACL manifest，經真 native Auth/PostgREST/PG 與 1280/390 Save→logout→fresh login→exact readback／Review 驗證。候選未部署、未 live 驗收；Primary VERIFY 交既有 Reviewer `01a10eea-4525-73ff-b5ca-4add8ac156a1`，不自行 APPROVE。

[候選與未來一次批准包](../prototype/private-site/schema/README.md)列出14表、14 SELECT policies、24函式、原始 SQL來源與hash、精確四個 writer EXECUTE activation／disable、可信身分初始化程序。business builder 無 RC builder／fixture import；fixture seed 只在短命原生 Auth 建好 users 後於 local business schema 寫 membership。public 原生 Auth表／default ACL／ensure_rls 未改。

本輪未連新 hosted 專案或舊DB27；未讀 key/password、無 Owner login、Data API／持久grant／部署／費用變更；未開 Publish。父提供的 hosted 初態不冒稱本輪 readback。正式三頁 theme 為下一 slice，本輪無產品 UI 改動。

## Agentic Verification Loop

| 驗證點 | 適用性及結果 |
|---|---|
| PLAN | 適用：latest Core／branch／base／envelope 對齐；保留原未提交候選工作。 |
| CODE | 適用：manifest 可重建、明列 table grants／function signatures；兩 public RPC + 原 private validators，legacy writers 不存在。 |
| UNIT / CONTRACT | PASS：schema 2契約＋frozen RC 6契約；既有 auth-session fixture 4契約（deployment closure 不包含 test entry）。 |
| BUILD / RUN | PASS：builder 產生 SQL；native PG17.6／GoTrue2.196／PostgREST14.17 真服務執行，無 mock SQL/Auth functions。無另需編譯的 schema build；Preview 只算靜態輸出檢查。 |
| BROWSER / DOM | PASS：原 product HTML/JS + loopback gateway，fixed logical backend 全量攔截轉至本次 native HTTP，其他外部網路拒絕；hash 清除、cookies 空、無 pageerror。 |
| DESKTOP + MOBILE | PASS：1280／390，成果 import→Save→Review，無 horizontal overflow；兩截圖已人工目視。scanner／WP 不重驗（本次未改，PR24既有覆蓋），不宣稱 URL scan端到端。 |
| DATABASE / AUTH | PASS：70 native Auth migrations、三位 native synthetic users、真正 password grant JWT、Auth GET user 及 PostgREST 驗簽。24函式 owner/search_path/security/EXECUTE、14 RLS policies/table ACL逐項比對。unsafe defaults／重套拒絕；default ACL、Auth functions、auto-RLS不變；future table 無 API SELECT。 |
| SAVE | PASS：native HTTP各尺寸Save一次、exact request replay零delta；changed payload／stale expectedversion拒絕。每尺寸 Save+Review 合計1version/1review/2audit。 |
| LOGOUT → FRESH SESSION → LOGIN → READBACK | PASS：真 GoTrue logout／refresh token拒絕；新browser context與新 server-issuedJWT，先exact payload後Review，再次logout/login後exact Review/audit資料不變。產品signout清前端session；測試另外呼叫GoTrue logout，不宣稱現有產品signout已執行伺服器撤銷。 |
| TENANT / PERMISSION | PASS：viewer可讀不能寫、foreign org讀0／SaveReview403、刪除Authidentity後RLS讀0且write403；wrong JWT401、anon14表／2RPC拒絕、table直接寫／TRUNCATE拒絕、legacy RPC404、audit零新增。 |
| UNKNOWN | PASS：兩尺寸各在 Save／Review 已 native commit 後丟棄response，POST各僅1次；原request/version只GET查回，不更換／重送。無資料的unknown lookup零mutation。 |
| VERIFY | 本機PASS且owned容器／網路清理零殘留；CI／Preview核exact HEAD後交既有Reviewer。非 hosted或真人RC驗收。 |

## 可核證證據

本機 run `growth-native-http-48085045-b55b-4d50-8baf-595d7817bd9d`，完成清理時間 `2026-10-06T02:22:30.791Z`。五份payload位於 [evidence目錄](evidence/Private_Site_Schema_2026-10-06/)，[SHA256SUMS](evidence/Private_Site_Schema_2026-10-06/SHA256SUMS) 可核原生HTTP/catalog/cleanup JSON、UI逐尺寸JSON、兩張PNG、static contract log。不含密碼、JWT、service key或真Owner資料；syntheticUUID不是部署參數。

CI 加入候選契約、native+browser驗證及3日artifact retention；維持舊native regression原mode與既有fixture gates。exact CI run/job/steps／Preview deployment identity記在 PR與交審回覆，避免為更新HEAD自引用反覆commit。

## 本輪必要修正與 SYSTEMIC_FIX

- CI 37403586143／job112076040533 第24步驗出原native runner屬RC frozen hash清單；首版擴充其參數違反bytes契約。改以schema目錄內獨立candidate runner，舊runner還原PR24原始bytes、frozen hashes不改。沿用原生服務生命周期helpers，沒有import RC business schema builder；從frozen契約與新native流程重新驗證。

- 組裝期 SQL-language membership predicate 需在所查 tables 後建立；native creation證明並修順序。
- function manifest regex漏掉 `fr_utf16_length`／`fr_decode_utf8` 數字名稱，native catalog完整比對揭露；修正identifier解析，現在全部24函式皆明確REVOKE。由 runtime catalog抗漏清單，不單靠生成器自比。
- local future-table probe誤傳json helper參數、UI reconciliation選擇器修正；PostgREST對無EXECUTE函式可能回404而非403，接受拒絕且對啟用後做無效null輸入readiness，等待cache reload，無額外Save。不是產品契約放寬。
- **路由 RCA**：本輪重入摘要明列最新schema Core，agent卻優先採thread最初 `<codex_delegation>` 中「fetch/checkout feat/passwordless-workspace、HEAD6663／PR19，失败停止」，執行fetch後舊branch因另一worktree佔用checkout失敗。未改工作分支／工作檔；latest branch/HEAD/merge-base只讀確認仍PR24。實際失誤是忽略恢復摘要的時間順序，而非repo要求回舊branch：現有 recovery第4條與engineering第1條已禁止此行為。最小SYSTEMIC_FIX將同一規則提升到每次直接讀取的AGENTS入口，明確先最新Core/branch/base/envelope與status/diff，禁止重播最初初始化。原thread早期訊息及平台如何重送context不在repo可修改範圍；沒有證據證明外部loader故障，未猜測或修CLI/catalog/installation_id，也未另開維護PR。此防護仍需agent遵循，不能保證平台層不再注入歷史訊息。

## 邊界、限制與 deferred debt

此包是批准候選；Data API OFF／真部署role memberships／managed extensiondefaults與native fixture不完全等同，未來批准後仍須目標精確pre/postflight，差異即停止。native UI採password login/測試callback入口，未驗magic-link/OTP或郵件。schema無自動identityseed/公開signup owner，尚無liveOwner資料。這些是部署前門檻，不是已完成主張。

沿用PR24已審P3：source limiter共用loopback IP（gateway接線，發現於3cc7d847；隔離schema無依賴、未新增traffic）；target host capacity/whole-backup未驗（部署前需驗）；上游CIactions Node20/24及deprecated dependency（現有CI可跑、不是schema功能阻塞）。暫維持既有受控範圍，不擴修；部署／traffic／runtime升級觸發再處理，追蹤者待Dot指派。無新增必要P0/P1/P2；本Core CoreMilestoneProgress=1，maintenance連續0，下一Core由Dot選。
