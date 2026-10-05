# 同 run 發布服務 process 重啟恢復

目前 Core 由父最新派工授權，基準 `f5050c9ddb0d7adea5058244df95e3c611bcef1c`；③已由 Reviewer `01a10836-e798` APPROVE_WITH_DEFERRED_DEBT，CI `37224426420`／Preview `7fE9bVde8rBeXkrsf4ufjU9KywVs` success。只將同 run 的單一 publication service process 恢復缺口提升為 Core；不開始④。

## 實作與持久邊界

- 原 publisher 放入獨立 Node OS process，由原入口透過 IPC 呼叫。原 runner 的 synthetic Auth／SQL 與 TLS broker 保持存活，原 App Password 只留 broker 記憶體。測試真正 SIGKILL publisher，再 fork 新 PID，沒有用清空變數或只換 browser 模擬重啟。不是整個 runner、資料庫、主機或跨 run 恢復。
- 最小 `journal.mjs` 保存既有 operation／measurement 的完整有序快照，綁同 run、journal ID、org、target page／URL、原 expiry；沒有通用 store／schema／provider。檔案 0600，SHA256 checksum 與 sequential envelope 核對，32 MiB 上限。checksum 是損毀偵測，不是防惡意改檔的簽章。
- **write-before-intent**：完整 preview 與其 before/after/version/binding 落盤；提交前先將同 operation ID 的 `submitting` 寫到 exclusive `.next`，fsync 檔案 → rename → fsync parent directory 全完成後，才允許 WordPress POST。紀錄 fail／partial commit 阻擋 POST；同實例 poisoned，須停止處理。缺檔、截斷、checksum／binding 不符、殘留 `.next`、語義不足紀錄均拒絕 cold startup，不修補／建立空檔取代原 operation。
- **commit boundary**：WP commit 與本機 durable commit 不是同一交易。WordPress 成功後仍需 API／HTML readback，再 durable 保存 confirmed evidence，才回覆 caller；中途 process 死亡，disk `submitting` 只投影為 `unknown`。恢復提交同理為 `restore_unknown`，已開始恢復的 operation 不能再次恢復 POST。
- journal 為 authority；原 JSONL 仍是 audit artifact，不參與恢復。整份 snapshot 是同一 journal 的最小儲存機制，沒有第二套業務事件。publication 與 measurement commit 都是實際檔案寫入；零額外 WP／SQL 不等於零寫入。
- cold startup 只載紀錄。每次讀寫重新驗 synthetic identity／exact saved version／Review／tenant 與原短 grant，並透過原 App Password GET 確認原站原頁仍可用。expiry 不延長、grant 不重發，token／password 不在 journal／child env；不准跨 run／tenant／page reuse。過期／撤銷後，即使新 process、新 synthetic token 也拒絕。
- pending ID／before／after／version 保留，unknown 只做 GET reconcile；不能再次 POST 同 intent，不能新 preview，也不能拿重啟前另一 preview 規避。before 相符＝confirmed_not_applied 且原 intent 消耗；after＋API/HTML相符＝confirmed_applied；drift＝state_diverged，停止寫入。沒有自動 resend。

## Agentic Verification Loop

| 驗證點 | 適用性、結果與限制 |
|---|---|
| PLAN | 適用：同 run、原短 grant、單一服務 process 實際重啟，exact publication／measurement／pending 恢復。①②③路徑保留。 |
| CODE | 適用：minimal journal、獨立 worker／broker、cold reconstruction、UI transport-unknown 提示、既有入口真 kill。原 Auth fixture／SQL 未改。 |
| UNIT / CONTRACT TEST | 31 PASS：7 journal／restart + 原24發布／量測／CSV契約。缺檔、截斷、checksum、run/org/page/expiry binding、partial commit、incomplete evidence failclosed；提交前 commit fail 零POST；冷啟動錯 session/version/page、另一 preview 重送拒絕；drift GET-only。PID replacement、revoked與expired service拒絕。 |
| BUILD / RUN | 適用：原 pinned WP6.8.3／MariaDB11.4.8與 Node/static UI 實跑；無 bundle build，不以 Preview echo 代替。 |
| BROWSER / DOM CHECK | 適用：既有發布／量測 DOM、screenshots、1280/390 無 overflow／page errors；transport lost response UI unknown／publish disabled。 |
| DESKTOP + MOBILE E2E | 適用：1280／390 各一次完成 publication＋measurement 後 SIGKILL，再兩次於 POST 前／真 WP commit 後 SIGKILL；每次新 PID、fresh context/token、原站 run。每尺寸仍4 WP writes（2publish＋2restore），GET核對不重送。 |
| DATABASE / AUTH CHECK | 適用：原 synthetic session四安全負測、PG17六案、原 PGlite RLS；controlled WP 原生 grant 到期403／撤銷401後各再重啟，fresh token讀紀錄仍拒絕；無 page delta。沒有真 workspace JWT／OTP／2FA／hosted 操作。 |
| SAVE | 適用：完整 operation／measurement durable commit，保存兩份 CSV、source／dates／binding／publication ID；不是 hosted Save。 |
| LOGOUT | 適用：既有 sign-out UI，不擴稱 server revoke。 |
| FRESH SESSION / LOGIN | 適用：原入口關全部旧分頁／context、retire舊token，新context/token與空storage；同 run 原grant重驗。 |
| READBACK | 適用：新process＋新session的整份 measurement response deep equality，publication evidence deep equality；pending original ID與state恢復；historical v1／v2 unknown與restore後followup失效保留。 |
| TENANT / PERMISSION CHECK | 適用：cold pending viewer／foreign／wrongversion／wrongpage拒絕；新版本後舊版寫入拒絕、原四403／audit不增；late logout response不回填。 |
| VERIFY | 本機入口與契約通過後才commit；exact HEAD CI／Preview於交審回覆附上，必交既有Reviewer，Primary不自行最終驗收。 |

命令：

```sh
node --test prototype/wordpress-publish/journal.test.mjs prototype/wordpress-publish/publisher.test.mjs prototype/owner-workspace/publication-measurement.test.mjs prototype/owner-workspace/page-observation.test.mjs prototype/owner-workspace/measurement-preparation.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --wordpress
```

沿用 CI `controlled-wordpress-evidence` artifact，增加 `{1280,390}-journal.json`（無secret authoritative records）、原 `*-proof.json` 的 previous/new PID、SIGKILL、record count、bound expiry/run；`grant-restart-proof.json` 記最後 expired/revoked restart。原 PNG／JSONL 與①②③ logs 保留。僅清本次容器／tmpfs／TLS／env；無 prune。

## 有界 RCA：歷史 handoff 誤讀

本 worker 起始 handoff 的 `6663b7f…` 是10/2歷史 orchestration 基準；後續 Owner／父派工已授權完成③並以 `f5050c9…` 指派此 Core。恢復 turn 時誤將仍留在上下文的初始限定當目前工作，造成第三次同根因誤停；既有五個 diff 卻正是本 Core 已產生的 journal／service 進展。根因為未先依最新派工建立恢復書籤，而不是產品或 HEAD divergence。最小修正是以最新授權＋實際 HEAD＋GitHub PR #19 head_sha＋`git ls-remote origin refs/heads/feat/passwordless-workspace` 核对；三者皆 `f5050c9…`。本機 remote-tracking ref 曾仍是 `6663…`，不拿它取代即時遠端證據。五檔內容與前次進展吻合後保留繼續。沒有 reset/stash/drop、checkout舊commit，也沒有 loader/catalog/installation_id 維修或新治理系統。此段只記本次恢復證據，不另設任務。

## Technical Debt 與未驗證

| 問題／位置／發現證據 | 分級、影響、延期、暫時處置、重看觸發與追蹤 |
|---|---|
| 多 writer/CAS/exactly-once；原 site-plugin／publisher 與本 journal；②3c8f7c4／③f5050c9單runner證據 | P3，既有Reviewer允許延後；本Core限定一個受控writer，無多process共享journal／鎖／跨WP與disk交易，不阻塞同run singleprocess結果。預設disabled，外部站或多writer前重看；待Dot指派。 |
| 整個runner／主機／跨run durable state與grant；service broker依舊存活、原短grant記憶體 | P3，只有單一publisher process恢復提升並完成；不宣稱power-loss、任意snapshot rollback偵測或全平台容災。run結束刪站與secret，artifact不當新grant；跨run產品化前再設計授權生命週期；待Dot指派。 |
| 真provider、其他時區／訪問口徑與成效；既有measurement source/UTC合約 | P3，synthetic／provider-asserted不升格為真流量／因果；當前只驗關聯與恢復，不阻塞。真資料授權／④明確需求時重看；待Dot指派。 |

功能①synthetic保存與SQL、②真受控WP發布、③真publication＋synthetic量測及本次單process恢復，不等於完整持久產品／live M3／MVP／成效。未執行hosted restore/login/Save/Review POST、live URL、模型、費用、外部帳密／OAuth或Owner站。原 Auth fixture、SQL、runtime雙份disabled SHA `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`、frozen index `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351` 不變；hosted DB27僅沿父已核狀態、本次無連線。CoreMilestoneProgress=1，連續maintenance=0；交既有Reviewer後停止，不自開④。
