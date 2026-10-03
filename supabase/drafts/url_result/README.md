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

- `node --test prototype/owner-workspace/workspace-api.test.mjs prototype/owner-workspace/url-result-api.test.mjs prototype/owner-workspace/opportunity-order.test.mjs prototype/public-audit/first-result-review.test.mjs prototype/public-audit/first-result-save-intent.test.mjs supabase/drafts/url_result/offline.test.mjs`：46 tests，涵蓋鏡像、角色／scope／關閉預設、完整 payload、讀回錯配、新 SQL 七群組及外層測試。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/url-result-ui.e2e.mjs`：真 product Review→交接／匯入→workspace 確認→隔離 SQL→完整讀回，1280/390；同 origin 錯 window、錯 origin、nonce replay、來源頁修改／取消、未知查無後 GET 對帳、POST 晚回覆後登出／跨 org、新 session 讀回、owner/editor/viewer、0/multiple membership、closed gate。每 viewport 首存＋兩次追加總 budget 1 parent／3 versions／3 audit，無 Profile/source/decision。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/typed-draft-ui.e2e.mjs`：保留 strict SELECT lazy-read、HTML/Unicode、收合／刷新／逆序、legacy UUID 四案，1280/390；每 viewport 六個 legacy mutation、零舊 typed mutation。新 URL 保存的合成寫入計數由上項另列，不混稱全部零 typed mutation。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/public-audit/product-source-ui.e2e.mjs`：既有 URL／Review／Copy／Export／容量／來源回歸，1280/390 各 22 真下載；無遠端請求。
- `python3 -B -m unittest -v test_app.py`（prototype/public-audit）：靜態/API 相關回歸。
- `node supabase/drafts/url_result/native.mjs`：固定 PG17.6 image、無下載／host ports／network；同 request、同版本、跨 parent request、save-before-revoke、org 等鎖期間撤銷、membership 等鎖撤銷，斷言不同 backend 與 blocking 關係。本機缺 pinned image，**BLOCKED／exit 2**；語法檢查通過，新 CI 步驟待父核對。既有 PG17 PASS 不冒充這份新函式並發已通過，PGlite 不代替多連線。

本機 logs：`/tmp/url-result-final-unit.log`、`/tmp/url-result-ui.log`、`/tmp/url-result-legacy-ui.log`、`/tmp/url-result-product-regression.log`、`/tmp/url-result-python.log`、`/tmp/url-result-native.log`。Chromium 151 與 PGlite PG18.3 為本機環境；新 commit CI/Preview/PG17 證據由父獨立驗收。

## 遠端另批集合

本次不部署。另批須列最終 SQL/hash、schema/function/ACL 差異、固定身份與 org、parent/request/payload、row budget、到期及 DB 硬限制、真 JWT/login/Save/跨 session 讀回、唯讀對帳與停寫收尾。單純 authenticated EXECUTE 會讓所有合格 owner 可寫，不是固定 fixture 硬限制；本候選仍 closed，未偷渡這種開放。未知遠端結果不重送，不沿用任何舊批准。
