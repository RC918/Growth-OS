# URL 成果待審保存：離線整合候選

Owner 2026-10-03 05:14 UTC（`Sentinel_60db595dcd2c819190b1bc8c6385d935`）同意父 04:55:45 提案：URL 先取得成果及 Review，登入後歸入 URL 待審項目，不先 Business Profile／approved opportunity。此次僅設計與離線工程；遠端 DDL／ACL／查詢／寫入／登入／真 Save／公開 URL 抓取／模型／費用均未新增授權。04:01 的單次 closed deployment 已完成，不可重用。

本候選位於 drafts，不被 migration discovery 自動部署。依賴已部署的 first-result closed schema；不修改或重送歷史 `../first_result_save/closed-package.sql`（52,447 bytes，SHA-256 `6a711df72cdf5bd5700f7148aa98b1982ca1209c5b5fe2fdf48a3a1288275beb`）。

## 選定模型及 DB 保護

- `growth_opportunities.entry_kind` NOT NULL／default `legacy_opportunity`，增加 `url_result`；舊／新形狀互斥，URL 固定 `url_pending_review`。舊必填欄移除 NOT NULL 後由 `IS NOT NULL` 與 `coalesce(...,false)` 條件約束維持；原長度／channel checks 保留。URL 不填 audience/rationale/channel 等舊業務欄位，不偽造 source、decision 或 Profile。
- parent id／org／kind／source_identity 不可變。來源身份固定 original/final URL、snapshot UUID、source version 及 bytes digest；僅同 snapshot 可追加文本版本，改來源須新 parent。
- `content_versions` 原 FK、版本唯一鍵、org/request unique、typed payload CHECK、RLS 與 audit 繼續使用。新增版本 trigger 阻擋 URL parent 的 legacy／錯來源 payload，資料庫直接寫入亦受約束。既有 validators 驗完整 bytes／hash、Review／引用結構；不代表獨立驗真或站點所有權。
- `save_url_result_draft` 為正式保存用途的 public invoker／private definer，非 probe。owner-only，actor 只取 `auth.uid()`，org→membership→parent 鎖序、等鎖後 membership 重查與 share lock、expected-version、org/request 冪等及原子 audit。首次 parent UUID 由保存意圖預先固定；expected=0 且 parent 不存在才可建立。碰撞不接管，source 不同不覆寫，相同 request 不同 payload 拒絕。
- 舊 opportunity review／legacy draft／generic content review／action plan／`save_first_result_draft` 五個 private impl 皆明確拒絕 URL 類型，其原 gate、簽名與 ACL 保留。新 Save 拒絕 legacy parent，包括用旧 request 混入的 replay。URL 狀態無法成為 approved/published；沒有新發布入口。
- 新 public/private Save 函式對 PUBLIC／anon／authenticated／service_role 的 EXECUTE 全關閉；離線測試只在可丟棄 DB 暫授權。候選不包含開閘 SQL。

成功 row budget：首存 **1 parent＋1 version＋1 audit**；同 snapshot 追加 **0 parent＋1 version＋1 audit**；冪等重送／拒絕／衝突新增 **0**。org/member/Profile/source/decision/review/plan 新增均為 0。Audit 記錄 created_parent、source/content/request 三種摘要、`caller_supplied_unverified`、`approval=none`。

## 真頁面接線及現有限制

`apps/web/first-result.html` 使用現有 URL→Review→完整 export，明確點擊後開啟既有 workspace。same-origin、指定 window/event.source、一次 nonce 交接，沒有 token 傳遞／自動 POST。來源頁修改／取消／離開使舊交接失效；登入取消不刪原頁成果。若 email link 開啟無 opener 的分頁，使用原完整 JSON 匯出／匯入；無新 localStorage、sessionStorage、IndexedDB 或 server store。未匯出且關掉原頁不能承諾恢復。

Workspace 直接掛載 `url-result-save.mjs`，共用從已驗 save-intent 提取的完整 payload validator 及既有 typed readonly renderer。**不使用 `createResultReview(exported)` 重建已編輯成果**，原文／原建議／checks／revision／receipt／payload 無損保留。選新 parent 或同 source identity 的既有待審項目，明確確認後固定 payload／request／expected version。沒有另一個可編輯 Review 面、demo 或 unwired adapter。

`url-result-config.mjs` 的 `urlResultSchemaEnabled=false`、`urlSaveEnabled=false` 固定出貨；API 要求兩者才可 dispatch。schema flag 關閉時 dashboard 保留已部署欄位投影，不要求未部署的 entry_kind/source_identity；schema 已啟用但 Save 關閉時仍保留正確 URL 唯讀呈現。沒有 URL/query/localStorage 開閘方式。離線瀏覽器測試只攔截該靜態 module 啟用 schema／Save，並將所有外部 HTTP 攔截成合成 Auth＋隔離 PGlite 查詢，未知路徑使測試失敗。原 Python 公開 scanner server 只新增 handoff module 的靜態 allowlist；完整 workspace 路徑由 apps/web 的既有靜態 hosting 提供。

保存返回 UUID 後按 org/request 精確讀回並核對 UUID、parent、version、metadata、全文 payload 與投影。未知／HTTP 失敗／衝突不重送、不更換 request；只查詢原 request，查無仍保持未知並禁止新保存。晚回覆不跨登出／context／刷新。待查 request 只在該頁記憶體；登出或關頁會失去此查詢意圖，重新登入仍可讀版本列表，不能把它稱作未知請求的持久恢復。

新登入沿既有 Auth 的 `create_user:false`。恰好一個 owner membership 才可保存；editor/viewer 只讀，0 或多 membership 明示限制，不自動建 org/user/member、不任選 tenant。無帳號／無 membership provisioning、多工作區選擇與專用審核／發布不在本次範圍。本頁 confirmation 不是 owner approval。

## 離線證據與執行命令

- `node --test prototype/owner-workspace/workspace-api.test.mjs prototype/owner-workspace/url-result-api.test.mjs prototype/owner-workspace/opportunity-order.test.mjs prototype/public-audit/first-result-review.test.mjs prototype/public-audit/first-result-save-intent.test.mjs supabase/drafts/url_result/offline.test.mjs`：初版 `97ce6ed` 本機為 46 tests（歷史；本次修正證據見下節），涵蓋鏡像、角色／scope／關閉預設、完整 payload、讀回錯配、新 SQL 七群組及外層測試。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/url-result-ui.e2e.mjs`：真 product Review→交接／匯入→workspace 確認→隔離 SQL→完整讀回，1280/390；同 origin 錯 window、錯 origin、nonce replay、來源頁修改／取消、未知查無後 GET 對帳、POST 晚回覆後登出／跨 org、新 session 讀回、owner/editor/viewer、0/multiple membership、closed gate。每 viewport 首存＋兩次追加總 budget 1 parent／3 versions／3 audit，無 Profile/source/decision。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/typed-draft-ui.e2e.mjs`：保留 strict SELECT lazy-read、HTML/Unicode、收合／刷新／逆序、legacy UUID 四案，1280/390；每 viewport 六個 legacy mutation、零舊 typed mutation。新 URL 保存的合成寫入計數由上項另列，不混稱全部零 typed mutation。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs`：既有 URL／Review／Copy／Export／容量／來源回歸，1280/390 各 22 真下載；無遠端請求。
- `python3 -B -m unittest -v test_app.py`（prototype/public-audit）：靜態/API 相關回歸。
- `node supabase/drafts/url_result/native.mjs`：固定 PG17.6 image、無下載／host ports／network；同 request、同版本、跨 parent request、save-before-revoke、org 等鎖期間撤銷、membership 等鎖撤銷，斷言不同 backend 與 blocking 關係。本機缺 pinned image，**BLOCKED／exit 2**；語法檢查通過，新 CI 步驟待父核對。既有 PG17 PASS 不冒充這份新函式並發已通過，PGlite 不代替多連線。

本機 logs：`/tmp/url-result-final-unit.log`、`/tmp/url-result-ui.log`、`/tmp/url-result-legacy-ui.log`、`/tmp/url-result-product-regression.log`、`/tmp/url-result-python.log`、`/tmp/url-result-native.log`。Chromium 151 與 PGlite PG18.3 為本機環境；新 commit CI/Preview/PG17 證據由父獨立驗收。

## 遠端另批集合

本次不部署。另批須列最終 SQL/hash、schema/function/ACL 差異、固定身份與 org、parent/request/payload、row budget、到期及 DB 硬限制、真 JWT/login/Save/跨 session 讀回、唯讀對帳與停寫收尾。單純 authenticated EXECUTE 會讓所有合格 owner 可寫，不是固定 fixture 硬限制；本候選仍 closed，未偷渡這種開放。未知遠端結果不重送，不沿用任何舊批准。

## 97ce6ed 父審查 HOLD：授權、dispatch 與精確對帳修正

父提供 push CI `37100438616`／PR CI `37100440301` 均在新 native harness 第 22 行失敗：首次 SELECT 1 成功後 show server_version 遇 socket missing／shutting down。新 URL 並發 assertions 尚未執行，後續 browser steps 全 skip；Preview Ready 不作驗收。原本機 46 tests 與 browser PASS 是歷史本機證據，不能代替失敗 CI。

先以未修產品／SQL 重現：

- 新 SQL actor×target×RPC 矩陣共 75 組：foreign tenant、revoked owner、editor、viewer、null actor × URL／legacy／missing × 五個舊 RPC。25 個 URL 目標回 23514，其他目標回 42501，重現未授權類型／存在差異；這是**未部署草案**的缺陷，非遠端事件。紀錄 `/tmp/url-result-auth-before.log`。
- 在實際頁面暫停 Save 的第一個 WebCrypto digest；取消交接、修改來源頁 Review、刷新、pagehide 後再釋放。兩 viewport 共八案原本各送出一個失效 POST。另 RPC 回 UUID A，首 GET HTTP 失敗或 id 不符，手動 GET 僅換成 UUID B 而其餘欄位完全相同，四案原本誤顯保存成功。12 案 FAIL，紀錄 `/tmp/url-result-races-before.log`。
- 直接取 native harness 的 readiness predicate，以 PID1=bash／暫時 server SELECT 1 成功作合成控制，原判準誤回 ready，FAIL。紀錄 `/tmp/url-result-startup-before.log`。這驗證 init-server readiness 缺口；不是聲稱本機已實跑 Docker 故障。

修正：五個 subtype guard 改插在**原 owner/org 授權 block 之後**；先核 block 形狀與 42501，遇非預期函式內容整份草案停止，不搬動／移除舊 gate。API 的 `saveUrlResult` 必须收到同步 live-intent guard，完成 async payload 驗證後，緊接 POST 前再核 intent ticket／object／session；沒有有效 guard 不 dispatch。只有真正 dispatch 才轉 unresolved，已送出後仍僅 GET 對帳，不重試。

RPC 回傳 UUID 保存在同一 unresolved intent 的 `returned_version_id`，首次及每次手動讀回都帶入；就算刷新／取消使原 render 失效，已回傳 ID 仍留給該待查意圖。完成顯示前再次核對當時已知 ID，避免 GET 等待期間收到 RPC ID 卻漏核。沒有回傳 ID 的未知結果仍只以 org/request 精確對帳，不造 ID。

Native harness 重用既有 first_result_save runner 的最終 server 判準：PID1 comm=postgres **且** SELECT 1 成功，再核 PG17.6 與 listen_addresses 空值。新的合成 readiness 測試從實際 harness 擷取 predicate，暫時 init server 不再誤判 ready；沒有盲目重跑原樣 CI。

修正後受影響驗收：

- `node --test prototype/owner-workspace/workspace-api.test.mjs prototype/owner-workspace/url-result-api.test.mjs supabase/drafts/url_result/offline.test.mjs supabase/drafts/url_result/native-startup.test.mjs`：**28/28 PASS**，含 mirror、75 組全部 42501、owner 對 URL 的拒絕及原 legacy 成功路徑，`/tmp/url-result-p2-final-unit.log`。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/url-result-races.e2e.mjs`：**1280/390 共 12 案 FAIL→PASS**；失效 pre-dispatch 零 POST，錯 UUID 拒絕、原 UUID A 可用 GET 恢復且全程只有一次 POST，`/tmp/url-result-races-after.log`。
- 原 `url-result-ui.e2e.mjs`：1280/390 整合回歸 PASS，仍包括無回傳 ID 的 unknown GET-only 與原 1 parent／3 versions／3 audit budget，`/tmp/url-result-p2-integrated.log`。
- native syntax PASS；本機仍缺固定 PG17.6 image，實跑 **BLOCKED／exit 2**、無 pull，`/tmp/url-result-native-p2.log`。新 CI 已納入 readiness／race 測試，真正新函式多連線與後續 browser steps 須父重新核對，不能宣稱已補齊。

本次沒有重跑無關 scanner／模型／歷史 SQL PASS，沒有遠端操作。schema/Save flags 與新 EXECUTE 仍 closed；歷史 closed-package 原檔 52,447 bytes／SHA-256 不變。
