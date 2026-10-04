# 已保存 URL 成果的確切版本 Review（離線候選）

2026-10-04 Core：Owner 展開既有 URL 最新保存版本，對照原文、修改、來源與相關必要事實，確認後從新合成 session 讀回同一資料庫確認。確認只適用該 version UUID／source digest／content digest／原保存 request digest；舊 page-only receipt 不具此權威，確認亦不代表獨立驗真或發布授權。

## 最小實作與邊界

- 沿用 `content_reviews` 的 org/version 唯一約束、member SELECT RLS、禁止客戶端直接寫入及 `audit_events`。只新增 URL request／三個摘要／五項 Owner 核對欄位及專用 RPC；沒有新資料表、通用儲存層或意圖框架。
- SQL 使用 Owner、org → membership → parent/version 鎖，等待後重核權限與最新版本。確認和 audit 同一交易；相同 request/actor/version/摘要/checks 冪等，其他 request 不得覆寫同版確認。新版不繼承；舊 request exact replay 只回傳歷史紀錄。legacy URL mutation guards 不變。
- 原文、建議、修改、來源、事實／推論／缺口由既有 `typedDraft` 完整保留。五個核對不可由 receipt 預填；相關阻斷事實未確認不能送出。開始續編清空本次核對且不將原版確認套用到未保存修改；取消保留已保存內容。未知／不相關缺口仍顯示，不自動宣稱已驗真。
- 重用現有 `createRevisionMarker` schema、sessionStorage backend 與防重送規則，僅給 Review 獨立 key `growth-os:url-review-attempt:v1`，避免與 Save 碰撞。僅儲存一筆 IDs/摘要 metadata，不存 payload/token。可靠寫入後才送出一次 POST；未知結果（含 GET 空）只查原 request，已知 UUID 必須相符。reload／logout 不清掉未決 metadata；不同 actor/org 拒絕恢復。並發 API 呼叫在 dispatch 前重核 marker，不使原 request 的讀回失效。
- 新 browser context 可依既有 version 唯一紀錄 GET 精確讀回同一確認；viewer 同 org 唯讀、foreign tenant RLS 隔離。頁面或 session 變更後晚回覆無法成功套用。

`proposal.sql` **不在 migrations**，兩個新 RPC 預設對 PUBLIC／anon／authenticated／service_role 全關閉；既有 Save ACL 不變。`urlReviewEnabled` 預設 false，兩份實際 runtime config **完全未改**，均維持 Save=false、Review 未啟用，closed SHA `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`。舊 06:00 envelope 已結束。本次不含 remote DB、migration、ACL、登入、Save、Review、live URL、模型或發布操作。

## 可重現證據

以下均為本機合成資料／隔離 DB；SQL grant 僅在 disposable test DB。CI 已加入同樣命令，新 HEAD 雲端 CI／Preview 仍待父核對。

| 命令 | 結果與證明 |
|---|---|
| `node --test supabase/drafts/url_review/offline.test.mjs` | 7 子檢查 PASS：預設 ACL、精確確認及 row budget、Owner/RLS/禁止直寫、錯 UUID/tenant/digests/checks、latest/history、legacy guard、audit 失敗原子回滾 |
| `node --test prototype/owner-workspace/url-review.test.mjs` | 5 PASS：closed bytes/gate、角色/checks、storage fail closed、並發單 POST/原 request/UUID readback、取消與 session 晚回覆 |
| `node supabase/drafts/url_review/native.mjs` | 5 PASS：same-request／competing-request、Save 先得鎖、Review 先得鎖、membership 等待後降權；每項 `pg_blocking_pids` 證明獨立 holder/waiter/observer backend |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/url-review.e2e.mjs` | 1280/390 各 12 情境 PASS：success/new session/history/viewer/foreign、unknown committed/empty + same-tab 身份切換、錯 UUID/摘要、stale latest、送出前取消、送出後停止等待、登出晚回覆、source/actor drift、closed gate；原 v1/v2 full row 不變，0 或 1 review/audit，最多 1 POST，無水平溢出 |

Native 使用已存在的 pinned PostgreSQL 17.6 image、`--network none`、無 host port、無下載。瀏覽器為本機既有 Chromium 151；不冒稱 CI Chromium 145 已通過。新 E2E 以顯式合成 config/transport 啟用 Review，未覆寫部署檔案。

受影響回歸：workspace API／saved-result-review／revision-marker 與新 SQL 合計 runner 31 PASS；既有 bound config/contracts 6 PASS；1280/390 saved-result-review、typed-draft-ui，以及 saved-result-save 的 success/session_restore PASS。marker 並發修正後再驗新 API contracts 與 success/unknown_commit/cancel_after UI。frozen bounded-v2 九檔與兩份 closed runtime bytes 保留。

## 剩餘缺口與下一 Core

離線垂直切片成立，不代表 remote schema/RPC 已安裝、live Review／跨真登入已驗收，亦非完整 M3／Publish／Measure。下一必要 Core 為此確切版本 Review 的獨立 bounded live 驗收準備／授權後驗收：新批准下核對 exact actor/org/version/request/artifact、窄範圍 RPC/gate、一次確認與 audit、cleanup closed、新 session 原版讀回；不能沿用舊 envelope 或直接部署本候選。

P3 debt：metadata 延用既有 marker 的「續編／保存」錯誤字樣，對 Review 語意略粗，但不影響拒絕重送與讀回；待統一文案時再處理。相關事實核對是 Owner attestation；若後续產品需要獨立驗證或新來源，需另完成其來源／版本流程，不能由這次勾選推論驗真。
