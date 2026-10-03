# 新 bounded v2 真保存候選：未批准、未啟用

本輪 Core 是為「既有成果真續編一次 → 重登入 → 精確 v2 與 v1 history」形成可 review 的新 envelope。不是重做 first Save，不是新架構，不擴大 unknown 恢復範圍。起點 `495516b71d20bd975f6f1afa88eb160883409160`，父提供 Reviewer `01a1039a` APPROVE、PR CI `37153710795` success、Preview `BTuUpxFXMNHJJU7EVK8dQnNMk6NX` success；這些不表示本候選已獲遠端批准。

**這是方案＋離線 SQL／payload 候選，不是可立即執行的包。** cutoff=null；`opening.sql.template` 的 `__OWNER_APPROVED_UTC_CUTOFF__` 無法轉成 timestamptz，未綁定即拒絕。尚需下述 bounded-v2 UI/API 局部接線、完整離線整合及 Reviewer 核准，父才一次向 Owner 提交完整批准。原 17:26 first-case 批准已收尾，不能繼承。這輪沒有 remote、login、live POST、runtime config、部署或現有 frozen artifacts 修改。

## 固定資料與版本

完整識別、各種 hash、預算見 [manifest.json](manifest.json)，artifact bytes 見 [hashes.json](hashes.json)。不得混用 payload 文件 SHA、canonical payload SHA、Review content digest、local intent digest 與 PostgreSQL jsonb request digest。

| 項目 | 固定值 |
|---|---|
| isolated project | `vhzryhibmpvglzcmfnaa` |
| 同一 Owner | `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e` |
| 同一 Org A | `93a88055-0a0b-40c0-b22f-a6d312320001` |
| 已存 parent | `9bafbb2f-eea7-48ea-bc23-3896897f19c3`，`url_result`／`url_pending_review` |
| 基準 v1 UUID | `4595e34a-0b2d-4a73-984b-d7439b52325c`，version=1／draft |
| v1 request | `4d602b3f-272f-4282-9906-b0cc0155e1c7`，expected=0；本輪禁止 POST |
| 新唯一 request | `a326f6ce-03c7-4d3e-9fce-c22b2849cb48`，expected=1 |
| 結果 | version=2／draft／未發布；UUID 由 DB 回傳，未預先捏造 |
| v2 payload file SHA256 | `86e70a16a092114c23dd82708a0dfa0a60489a859b23dee91847d5207ad06a66` |
| v2 canonical payload SHA256 | `43dae94eec716a9c07ed86c64fe4b5a9ae6d54ba55c9e5da9ac7906f858d1c60` |
| v2 Review content digest | `sha256:581c752caa7050579c8251f1dc042aec3e1b0903c75c152170f96fc5e87d883c` |
| v2 DB request digest | `pg-jsonb-sha256:3bf2931ccc19769162d780220d346be4eb9b494bec3c8da39b50c7ac3ab497f2` |
| v1 canonical payload SHA256 | `5fd32cb8424a2efe1dfa3f93ba251d0637d34fcd6e77d2b21c342ffb8ed86241` |
| 預期既有 private prosrc SHA256 | `c18d5accbb81f9de92eea75c0af68f689bf536a4d534d7312dbf6996c6cc1579`；是函式 body bytes，非 pg_get_functiondef hash |

[v2-payload.json](v2-payload.json) 由原已驗收 frozen v1 經 `restoreResultReview` → **只一次** `edit('title','Bolt A — steel bolt for workshop assembly')` → 三欄 check → confirm → export 產生，Review revision=3。其餘 title 原文、meta、description、snapshot、來源、citations、original suggestions 不變。這是原 synthetic 測試成果的真續編持久化候選，不宣稱真客戶內容品質。live 必須先讀回精確 v1 與 frozen payload 相等，否則停止；不能直接假設本機 frozen 即最新 DB。UI 也必須經相同一次 edit 產生完全相同 payload／intent，不可手改 revision 來硬湊 hash；多 edit 或結果不等就不 dispatch。

## 最小局部接線需求（尚未實作，是執行前必要條件）

目前 runtime `urlSaveTrial` 限 expected=0；`workspace.mjs` 在存在 trial 時隱藏續編入口，故**不能**把舊 config 的 expected 改成 1 就宣稱可用，也不能設 trial=null 開一般 Save。

局部方案沿用 `urlSaveTrial`，新增明確 `kind:'revision'` discriminator 和本 manifest 的 base UUID/digest、expected=1、request、payload／intent digest、actor/org、現有 workspace URL、明確 cutoff。既有 first-trial kind/expected=0 行為及 artifacts 完全保留。

- `workspace.mjs`：revision trial 禁用 first-result 匯入 Save 面板，僅在 manifest 的 exact v1 row 顯示既有續編 editor。關旗標後保留 v1/v2 唯讀及既有 pending GET 恢復。
- `prepareUrlRevisionIntent`：revision trial 強制固定 request/base，檢查同 actor/org/exact base/payload/intent，禁止隨機新 request；正常模式維持原行為。
- `boundAvailable`／`saveUrlResult`／`saveUrlRevision`：保留原 expected=0 模式；revision discriminator 僅允許 expected=1 的精確意圖、來源、內容與 full payload；dispatch 前再次核對 cutoff、身份、metadata。不得放寬為任意 expected>0。
- 續編 marker 仍只有現有一筆 IDs/digests；dispatch 前可靠儲存。unknown 原 request GET-only，不新 outbox、不加 token/payload store、不跨 tab/device；resolved 後也不能在此 envelope 追加第三版。
- bounded-v2 必須新增桌面／手機全路徑離線組裝，驗當前 runtime closed、固定 v1→編輯→固定 intent→1 POST→known UUID/unknown GET→cleanup→第二合成登入兩版 payload；錯 bound、過期、storage 失敗零 POST。復用既有 fixture/API/SQL，不重做 tenant 診斷。這些**本候選尚未跑**，既有一般續編 E2E PASS 不能代替。

以上是既有 config／API／editor 的局部繫結，不需要新 schema、RPC、權限模型或新產品架構。本輪先提交可 review 方案及 SQL 候選；未偷偷實作此 runtime 接線。

## 必要方法、預算與安全順序

Owner 必須一次批准整個新 envelope：固定 project/actor/org/base/request/payload、**最多 1 次 Save POST、2 次 magic-link request/login、2 次新的 tracked migration、2 次 config transition（open→closed）**、讀回與 cleanup，並指定可用時間／絕對 UTC cutoff。不得自猜可用時間、預先寄信或生成短效開窗。metadata 可靠保存失敗即零 POST。若魔法連結未使用也計入 request 次數；不自行重寄第三封。

1. **repo 完成接線與離線驗證，Reviewer 通過。** 父端核對完整 HEAD、PR CI、Preview；owner 審閱固定 payload 與完整預算。先取得 Owner 可用時間再一次綁 cutoff，離線重算 SQL/config hashes、Reviewer 核對最終 bytes，由父一次提交完整批准。截止的唯一變更不能順帶換 request/payload/scope。此候選生成器沒有預設 UTC。
2. **批准後的只讀 preflight**：官方 Supabase `execute_sql`（或已批准等效只讀介面）指定唯一 project；執行 [preflight.sql](preflight.sql)。核 history=21 且既有 21 筆 version/name/statements 逐一保存；不是只信 count。兩個 URL Save entry 的 PUBLIC/anon/authenticated/service_role 有效 EXECUTE 全關，舊 first-result entry 仍關；public wrapper、RLS、其他函式／ACL 與已验快照相同。記錄既有 private body hash、Owner membership、唯一 parent、exact v1 full row/payload、最大版=1、此 parent 只有 v1、新 request/audit 不存在。既有 24 個資料投影及 schema/ACL 快照保存作後續精確比較，不輸出 token。current config 兩份 SHA 均為 `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`、Save=false；任何漂移停止，不修 remote。
3. **login 1，尚未開 Save**：既有 Preview／同一 tab，登入同一 Owner，GET 精確 v1/base/source/full payload。確認 scope 後經 Review 一次 title edit、check/confirm 的最終操作於已核准 bounded UI 完成；若未準備好或接近 cutoff，保持關閉，不擅延時。
4. **新的 tracked opening**：官方 `apply_migration`，name=`url_revision_bound_open_v2`，提交綁定後的 opening bytes；不使用 execute_sql 執行 mutation、不 replay 舊 opening/fixture/19-record schema installer。只 `CREATE OR REPLACE` 同一 private implementation，保留 signature/search_path/security definer／wrapper／schema/RLS，替換 bound request/expected/cutoff/digest，加 exact v1 驗證，再授予 authenticated 對既有 public+private entry 執行權。既有 actor/org/parent/source、鎖、截止多點檢查、payload驗證、樂觀版本及 request 冪等保留。預期 history21→22，只追加此次記錄。
5. **config transition 1**：經批准 repo/Preview 流程將兩份 runtime 設為 manifest 的 revision trial + explicit cutoff + schema=true/save=true，核對同一新 HEAD 與部署的 exact bytes／alias；不得用 console/manual REST 繞過 editor。先開 SQL、最後開 UI；任何部署/身份/時間不符立即 cleanup。這些部署是在未來 Owner 批准內執行，本輪未執行。
6. **唯一產品 Save**：同一 signed Owner，既有 `saveUrlRevision` → `POST /rest/v1/rpc/save_url_result_draft`；body 僅五參數 `p_organization_id`、`p_opportunity_id`、`p_request_id`、`p_expected_version:1`、`p_payload`。先核 intent/request hash 與 sessionStorage pending metadata 已可靠保存，再 dispatch。最多 1 POST，結果 v2 UUID 記錄。一個 HTTP timeout 不代表未提交；此後只 `GET /rest/v1/content_versions`，org+原 request filter（limit2），known UUID 若有必須一致。查無仍 unknown，不重送、不換 request、不刪 marker、不再 login 診斷；逾時也 cleanup。DB 冪等只是重複防禦，不增加 live POST 預算。
7. **立即 close**：無論成功、失敗、unknown 或 cutoff，官方 `apply_migration` name=`url_revision_bound_close_v2` 執行 [cleanup.sql](cleanup.sql)。首先撤銷兩 entry 的 PUBLIC/anon/authenticated/service_role EXECUTE，保留 bounded body與全部資料；預期 history22→23。config transition2 設 schema=true/save=false，保留已審 revision scope 供讀回；驗兩份 bytes/部署，不能只是 UI 顯示關閉。SQL cutoff 過期只是第二道拒絕，不能代替 ACL cleanup。
8. **postflight＋login 2**：先執行 [postflight.sql](postflight.sql)，比對原 21 migration records 未改、新增名字正確、其他 ACL/schema不变；v1 full row（包括原 title Unicode bytes）、parent及所有既有投影不變，只多 exact v2與audit各一。logout → login2（Owner第二次 magic-link，closed狀態），GET exact v2 UUID/full payload及原v1 UUID/full payload/history，桌面可見 version2 draft/未發布和version1；不再 POST。不清理成功資料。
9. **停止與交付**：保存完整 HEAD、CI/Preview identity、migration IDs、request/returned UUID、hash/count/GET證據與關閉證據；Owner確認，不自動跑其他 remote。已有 fixed-case Owner/RLS/tenant正負控制可引用，無新 OrgB 查詢或診斷 login；不能宣稱完整 live role matrix／全面 M3／Publish／Measure。

## Pre/post 與 rollback 限制

SQL candidate 的原 body hash 與 exact v1 是 fail-closed 條件；遠端不符即停，不從未知新 definition 自動 patch。readonly preflight 的 21 count 只是必要條件，必須額外核完整已驗 history/ACL；opening 內重核 count/body/base/closed ACL/request absence。DDL 與 grants 由單一 tracked migration 事務處理；平台結果 unknown 時先核 history/body/ACL，不能猜已 rollback 或重送 migration。

成功後目標 parent 仍1，version總數1→2，該 parent 對應 Save audit1→2，增量0/1/1；全庫除指定新 v2 row／audit row外逐項完全不變。v2 為 DB新UUID，expected1、version2、draft、同 actor/org/parent、新request、所有payload/content/intent/request摘要一致。若新request不存在，保留 unknown/未成功結論，不報驗收成立。

rollback 是**關閉權限＋runtime**，不是刪資料、覆寫v1、重設request或拆schema。opening失敗／unknown時先只讀確認；若已開或不能確認，走已批准 cleanup，不因 Save outcome unknown 延遲撤權。cleanup migration unknown 先核其 history與有效ACL；不blind retry、不新批准名稱。cleanup failure 維持UI關閉、停止所有寫入，報父核實；不換route繞過拒絕。新 Owner 批准需涵蓋關閉與資料保留；超過窗口不做額外 Save/登入，只完成已批准必要cleanup及既有結果唯讀核對。

## 離線證據與缺口

`node --test supabase/drafts/url_result/revision-bound/candidate.test.mjs`：7 tests PASS（含6個子案例）。PGlite 只在記憶體重建既有 closed schema＋v1，舊 opening 僅作 disposable fixture，沒有網路、远端讀写或新登入。驗 frozen生成／hash、未綁定cutoff拒絕、history/body/base/ACL漂移、錯 actor/parent/request/expected/payload、direct private拒絕、return-time expiry事務rollback、0/1/1增量、v1及全部public既有row不變、SQL duplicate safety（僅離線fault injection）、cleanup有效ACL、closed下兩版GET。初次測試錯用不可成立的 `in_review` 狀態（schema只允許draft），改以合法UUID身份漂移實際觸發base guard，沒有放寬產品約束。

不是 native PG concurrency 或 browser runtime v2-bound 整合證據；接線後需要 native PG17 對窄patch實際跑一次（既有 lock/deadline harness可復用），以及上述 desktop/mobile整合。既有 `495516b` 的同tab恢復／一般續編與tenant證據沿用，不為湊數重跑。本輪 readiness=**proposal/offline SQL candidate ready for review；live execution blocked pending local binding + final validation + new Owner envelope**。
