# Persistent Review 安全收尾｜2026-10-04

結論：批准的持續 Review 安裝及兩表權限修正已完成；真 UI Review 在五項勾選階段遭工具安全拒絕，未送出 Review POST。已完成保資料的 closed config＋tracked disable，Save／Review 全 closed、無待 cleanup。Reviewer `01a10755` APPROVE safe-closure，父於 14:34 UTC 通知 Owner。**完整 M3／live Review 未完成**，安全收尾不是產品 Review 驗收成功。

## 證據來源與基準

Owner 批准、official migrations、DB preservation、真 UI 與 Reviewer 結果由父 thread `01a0f25c-a8c0-7271-bf72-18411d628009` 提供；本文件歸檔這些證據，不宣稱本 docs slice 重新查詢 hosted DB 或登入。config commit、hash、GitHub CI／Preview 狀態及 CI logs 由本 executor 核對。

- Repository `RC918/Growth-OS`，branch `feat/passwordless-workspace`／PR #19。
- 安全關閉 runtime HEAD：`e1a008c48734c04f6592d19673747a012b7f3c36`。
- [CI 37208971001](https://github.com/RC918/Growth-OS/actions/runs/37208971001) success，job `111456044679` 全 57 steps 成功、無跳過；logs 包含 persistent allowlist／PG17、無人值守 session 與 1280／390 UI。這些 synthetic／isolated 證據不替代 live Review。
- 同 HEAD [Preview wGZQCtPZiLE6bCYAmDoW21HbS6Fe](https://vercel.com/morning-ai/growth-os-preview/wGZQCtPZiLE6bCYAmDoW21HbS6Fe) 的 GitHub Vercel 狀態 success，父亦核對成功。
- 凍結包：[persistent hashes](../supabase/drafts/url_review/persistent/hashes.json)，index SHA256 `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351`。候選原 bytes 保留；其中 proposal 的批准／窗口占位不能替代下列實際批准紀錄。

## 批准、執行與停止（UTC）

| 時間／順序 | 實際結果 |
|---|---|
| 13:04 | Owner 批准整份 persistent Review 包。 |
| 13:33 | Owner 將執行窗口更新為當日 15:30 UTC（台北 23:30）；不是功能自動到期。 |
| authority → install | 父經官方 `apply_migration` 各執行一次；history 23→24→25，closed postflight 通過。 |
| 第一 config transition | `77e42f5bb6e2229e385185e50f603a5acc799520` 套用 frozen disabled config。歷史 hash 與目前 runtime 耦合造成 CI fail；`b4bc8d63dc4c6f9f39ec4ed78670776b2d9445a2` 僅修三處必要測試依賴，分開 historical fixture／persistent allowlist，保留安全斷言。CI `37206851576` success，Reviewer `01a10733` APPROVE；不另計一次 config transition。 |
| 13:44 | Owner 接受正常 UI 生成唯一 random request，取代 fixed request；不修改 trial 或擴大 POST 額度。 |
| enable → 第二 config transition | 父單次 official enable，history 25→26。`56cdaa7703803c3521c258e46cd2f3cd4a886ef5` 套用 frozen enabled；CI `37207632229`、Preview `4wL6GLWT89gKyZau3LGVszyoAYSg` success。 |
| 14:15 | 完成 1 次人工登入。父 fresh 核對 OrgA Owner、既有 v2 與來源；接著五 checks 勾選被工具安全拒絕，五項全部 false，Review POST 0/1。 |
| 拒絕後 | Reviewer `01a10748` 確認 synthetic 本版主張有來源，但 execution 拒絕仍有效。停止勾選／POST，不換 route、不改產品或 unknown 造事實，不 reopen。 |
| 安全停用 | 依 Owner 已批准的 failure safety close 額外預算（最多 1 closed config＋1 tracked disable、截止 15:30 UTC），先部署上述 `e1a008c` closed config，再由父單次 official disable，history 26→27。 |
| 14:34 | safe-closure 已由 Reviewer `01a10755` APPROVE，父已通知 Owner。 |

實際合計：4 tracked migrations（原 3＋安全 disable）、3 config transitions（原 2＋安全 closed）、1 人工 login、0 Review POST、0 review／audit 新增。沒有待送出 Review 被當作 unknown 或假稱成功；既有 unknown／GET-only 契約未修改。

## Official migration 身份與 SQL SHA256

| 操作 | version | SQL SHA256 |
|---|---|---|
| authority revoke | `20261004133827` | `706a8928adec0b29dae3e49ed2dcef71aff5702dfffd41aeba80cbc7a286ecb2` |
| closed install | `20261004133933` | `bac4085c43bf6422fc6953bc49774602f538b455985ac4a5409aee45a2a6dac2` |
| enable | `20261004135815` | `c43c15ed6c7b08c3ad4cf9d437c754a78a6680778dc7ddc2fe89b03f5c04cabb` |
| disable | `20261004142549` | `3ad35e8b4fc5444cc51aeed49c67d7d3b8dc193776b10c084f916eceea424e6c` |

父確認 DB history 總數 27、closed postflight 通過，Save 與兩個 Review entry 有效寫入入口均關閉。Review schema／合法唯讀保留，沒有清除資料或 pending marker；不把 REVOKE 說成能追溯取消在途交易。

## 最終 config 與 preservation

[apps config](../apps/web/url-result-config.mjs) 與 [prototype config](../prototype/owner-workspace/url-result-config.mjs) 均逐 byte 等於 [frozen disabled config](../supabase/drafts/url_review/persistent/preview-disabled-config.mjs)，SHA256 `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`。兩 schema flags=true，Save／Review enabled=false，兩 trial=null。安全停用 commit 僅兩處 Review flag true→false；SQL／frozen／其他產品程式及 test-only SYSTEMIC_FIX 保留。

父 authoritative 核對結果：

- 20 張 public 原資料投影 counts／hash 保留；audit_events=32、content_reviews=4、content_versions=6，0 review／audit 新增。
- 原 23 筆 migration history 逐 row 保留；新增僅上述 4 筆 tracked 操作。
- allowlist 外 normalized catalog hash 保持 `f79d33e71b23dc4768fa4a0415e2be0fa245ce05e935b74d4b133544538e20bb`，PG role memberships 保留。
- `audit_events`／`organization_members` 對 PUBLIC、anon、authenticated 的 INSERT／UPDATE／DELETE／TRUNCATE 撤除保留。SELECT、RLS、合法 private 查詢／管理者維護、service_role 保留；不宣稱全部 ACL 完全不變，也不恢復原不安全四寫權。

## Owner 後續更新（15:07／15:11 UTC）

`HUMAN_REQUIRED` 只限制直接相依的真人確認，不停止獨立 repo/offline Core、tests、CI、Preview 或 docs；安全收尾維持。日常 regression 必須用安全隔離 synthetic fixtures／test-only sessions，不依賴 Owner。下節的停止／restore 限制是當輪 live 操作紀錄，不是全專案停工指令；Reviewer `01a10779` 已判定本輪 Bolt A synthetic fixture 是 A：可自動化日常測試，既有入口已完整覆蓋，不要求 Owner 勾選。hosted 工具拒絕是另一層執行限制，不等於測試本質 HUMAN_REQUIRED；不重試／restore。正式治理見 [AGENTS](../AGENTS.md)。

## 尚未完成與後續邊界（14:34 收尾時）

真正 blocker 是工具安全拒絕 Review 勾選的執行限制，不是新產品 P2，也不是來源未知必須改成事實。Reviewer 的內容判定沒有解除執行拒絕；不能透過換 route、改 checks／payload、直接 RPC 或重新啟用绕過。完整 live Review／M3 仍未驗收，既有 bounded Save／跨登入讀回與 offline Review 證據繼續有效。

後續須先合規解除受限執行，並取得新的 restore／操作批准、重核 deployment／schema／ACL 與適用窗口，才可恢復同一 Review 主線；本文件不構成 restore、登入或 POST 授權。當前沒有待 cleanup，不新增準備包、診斷或其他 maintenance；不將日常 regression 重新綁定 Owner 登入／2FA，沿用[既有自動入口](Unattended_Auth_Session_Regression_2026-10-04.md)。100cap、Publish／Measure 與 P3 文案維持原邊界。

本 docs-only 閉環只記錄同一 Core 的結果，不另計新產品能力。hosted schema／必要權限修正和安全關閉已完成，新增 live Review 成功閉環為 0；完成文件驗證與提交後交既有 Reviewer，停止本輪工作。
