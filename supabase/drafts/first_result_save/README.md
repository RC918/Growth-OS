# 未部署 First Result draft append/readback SQL 草案

Owner 於 2026-10-03 01:36 UTC 同意 01:07:25 UTC 提出的「離線 SQL 草案與隔離資料庫測試」（父轉交 Sentinel_31935a6d21e481918051a7d23844ae9e）。只批准本地合成驗證，**不是遠端 migration／grants／真保存／Auth UI 啟用批准**。

基準 `9ea837b82a490bd2affef85e661049db431127fd` 的純 save-intent 已由父接受：CI 37084305511／37084307932 success，14 save-intent／6 Review／39 scanner/API、1280/390 各 22 真下載；Preview `2RcV3YMjLdzmV7cPkzGwu2pjKG22` Ready。這些是既有證據，本輪未重跑其完整套件。

本目錄在 `supabase/drafts/`，不是 `supabase/migrations/`，migration runner 不會自動套用。只有本目錄的隔離 harness 明確讀取 proposal.sql；沒有產品程式 import、API dispatch、Auth、UI 或 remoteSave 接線。

## 精確候選差異

`proposal.sql` 在單一交易內：

- 只擴充既有 `public.content_versions` 四個 nullable 欄位：`first_result_payload jsonb`、`first_result_request_id uuid`、`first_result_expected_version integer`、`first_result_request_digest text`。
- 新增 `(organization_id, first_result_request_id)` 唯一約束。legacy 四欄皆 NULL，保留多筆 NULL；其他既有 FK／版號唯一約束／NOT NULL／draft 狀態／正文上限不改。
- 以 `content_versions_draft_shape` 取代舊 title CHECK。legacy 維持 title 1–160；typed 完整 payload 的目前 title／description 精確映射既有 title／draft_body，三欄均依 1–2000 UTF-16 units 驗證。meta／source／Review 全留在 payload，沒有截斷、trim、拼接或假標題。不可變原建議不受 2000 限制。
- 新增 `public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) returns uuid` invoker wrapper，及同參數 `private.save_first_result_draft_impl`，後者為可信 owner 的 definer、空 search_path、完整限定名稱。
- 必要 `private.fr_*` helpers 僅處理資料／摘要驗證。PUBLIC／anon／authenticated／service_role 對新 helpers 的 EXECUTE 全撤銷；只給 authenticated 新 public wrapper 與 private impl 的 EXECUTE。沒有新增角色、schema USAGE、直接表寫權、RLS policy 或 service-role 路徑。
- `private.review_content_draft_impl` 只在原 parent lock 內增加 typed payload 拒絕；原 public wrapper、legacy 角色／理由／最新版／單次決策與 audit 規則保留。typed public/private generic review 都拒絕，不寫 content_reviews，也不可能藉此通過既有 action-plan 的核准版本 gate。

沒有新增表、獨立來源 store、Profile gate 或新 opportunity。只有**既有合格 opportunity** 可以測試 append；不是一般新用戶保存已解決，不要求 URL 使用者先填完整 Business Profile。

## 保存交易與讀回

API 參數只有 org、opportunity、request-id、expected-version 與 export payload；不接受 fixture role、caller actor 或 page receipt 作授權。actor 來自 auth.uid()，每次（含重試）核對現在的 owner membership。

鎖序為 organization → owner membership FOR SHARE → opportunity FOR UPDATE。等待 organization 後重查並鎖住 membership，使撤銷與寫入序列化；org lock 亦序列化跨 parent 的 org-scoped request-id。既有 approved opportunity＋source＋approved decision 門檻每次重查。此最小方式可能序列化同 org 的不同產品寫入，刻意以正確性優先，沒有引入 queue／新鎖管理架構。

已有相同 request-id 時，actor、parent、expected-version、完整 JSONB payload 與服務端摘要必須相同，才回傳同一 version-id；異內容 22023。有效重試可以在已有更新版後讀回原 id，但 membership 或 gate 失效會拒絕。新 request 的 expected-version 不符目前最大版號，回 PT409；不自動換版重試。

同交易內追加一版及一筆 `first_result_draft_saved` audit，任一步失敗全部回滾。audit 僅保存 actor、request／parent／version、摘要、caller_supplied_unverified 與 approval=none；不寫原始 HTML。page-only receipt 是歷史核對資料，未確認草稿也可保存；均不是 owner approval 或發布。

讀回使用原 RLS SELECT，精確 org＋version-id，可另以 org＋request-id 核對不明結果。僅讀回完整 payload／版號／request 摘要後才可能在未來 UI 宣稱已保存；本切片沒有 UI 宣稱或自動重試。

## 來源、摘要與編碼

- 來源 bytes 從 base64 重算 SHA-256，核對 snapshot.version／content_fingerprint；HTML 依 UTF-8 replacement 解碼比對，BOM 保留。
- `private.fr_content_digest` 按既有 JS Review 的固定 key 順序、逐字串 JSON escaping 重建內容摘要；保留空白、引號、換行、組合字及 supplementary Unicode，不把 JSONB 序列化當 JS 字串或刪除內容空白。
- `pg-jsonb-sha256:` 完整請求摘要另包含 schema version、actor、org、parent、request-id、expected-version、完整 payload。它是服務端 JSONB 表示法，**不是**純契約的 JS request_digest；冪等另比較完整資料，不能僅靠摘要。
- JSONB 不保留原 JSON 的物件 key 順序／空白／等價數字表示；保留業務值、字串、陣列順序與 base64 bytes。PostgreSQL 無法表達 JSON 字串中的 U+0000，明確拒絕、不轉碼；這是本候選保存界線，不修改現有頁面 Review。
- 來源 bytes 上限 1 MiB；服務端 JSONB UTF-8 表示上限 8 MiB（含其序列化空白，所以與 JS 原 JSON 邊界略有差異）、深度 24／walk visits 100000；超過拒絕、不裁切。SQL typed facts／inferences／unknowns／citations／原文／修改標記／page-only receipt 全部重驗，來源、內容摘要分開。

內容自洽不證明來源擷取者、時間或事實真實，也不代表網站所有權。URL 只有純格式檢查，不執行 DNS／抓取，不是 SSRF 或獨立驗真證據。仍標示 caller_supplied_unverified。

## 本輪實際驗證

```bash
node --test supabase/drafts/first_result_save/offline.test.mjs
node --check supabase/drafts/first_result_save/native.mjs
node supabase/drafts/first_result_save/native.mjs
```

- 第一條：**13 個驗證群組 PASS；Node 含外層合計 14 tests PASS／0 FAIL**。現成 PGlite 0.5.8，合成 auth.uid()／owner/viewer/editor/foreign，載入既有 migrations 後明確套用本地 proposal；pgcrypto 安裝依既有 PGlite harness 排除，使用引擎內建 SHA-256，不下載 extension。
- 驗證 DDL rollback 無欄位／RPC／review 變更；新 DDL 保留原列；四組實際 builder 合成 payload 完整 roundtrip，含 2000-unit title、超長原建議、nullable facts 與 malformed UTF-8；264 組 bytes 向量與 JS TextDecoder／UTF-16 長度比對；114 個 evidence 刪除／型別破壞案例全部拒絕。
- 驗證 owner／tenant／機會 gates、membership 撤銷、gate 變更後重試拒絕、相同 request 一版一 audit、異 actor／parent／payload／expected-version 拒絕、舊 request 在新版後仍可精確讀回、PT409、audit 失敗整筆回滾及 request 可重用、typed generic review／action-plan 拒絕、legacy 建新版與核准仍可用、直接寫入及 helper 權限拒絕、停寫後資料可讀且 guard 保留。
- 各修改群組均 rollback；最後比較合成 20 張業務表完整原欄位投影、13 筆 goal history、private 模型帳務及 attempts 全部不變。這是本地 fixture 保留證據，沒有讀取遠端原資料或帳務。
- 第二條：native 腳本語法檢查 PASS。
- 第三條：**BLOCKED，exit 2**；Docker daemon 28.4.0 可用，但本機 image inventory 為空，缺固定 PG17.6 digest。未 pull、未啟動容器、未改安全設定，沒有原生多連線 PASS。

native.mjs 使用既有 `postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`、`--pull=never --network=none`、Unix socket、listen_addresses 空；只在一次性容器建立合成 Auth/資料。設計測試同 request、同 expected-version、跨 parent 重用 request-id，要求三個獨立 PID、pg_blocking_pids 真 Lock 證據、一次 append/audit及失敗回滾；這些 assertion 尚未在本機執行。CI 新步驟放在原有同映像 native-ledger 步驟之後，仍需父核對該新 SHA 的真實輸出，不能由 PGlite 冒充。

## 停寫／回滾與剩餘批准

DDL 自帶 BEGIN／COMMIT；尚未提交時可整體 rollback，本地已驗證。若已保存 typed 資料，`disable_writes.sql` 僅撤銷兩個新入口的 authenticated EXECUTE；保留來源、版本、RLS 讀取與 typed-review guard，不刪除任何內容。此檔也只是未部署草案；不會自行操作遠端。已有 typed 資料時不得直接恢復舊 title CHECK／移除欄位，避免丟失內容或誤核准。

四欄、唯一鍵、同 parent 版本序列與拒絕 typed generic review 為 Owner 已批准的離線設計。真正遠端仍需精確批准專案、migration／ACL 差異、fixture org／parent／actor、窗口、rollback-only 或允許的新增版本／audit 數量、前後資料投影核對。原生 PG17.6 競爭證據與真 Auth／RLS／精確讀回尚未取得；不能啟用 remoteSave。

舊 dashboard 只顯示 title／正文，未顯示 meta／typed 來源，也尚未收起 generic review 按鈕；服務端 guard 會拒絕，但不代表產品互動完成。typed 新版會使同 parent 舊版本不再是最新版，歷史核准保留，不移植到新版。Auth／UI 接線需下一獨立範圍。

公共 SQLite 100 筆上限與非破壞保留不變；本地 DB fixture 不是公共快照可回收的證據。沒有公開商品抓取、live POST、secret 存取、模型／費用、遠端 DB／權限／migration、Production、merge 或發布。

## 父審查後 P2：trim、混合鎖及 URL authority

父已核對 `c9ab0d8a6d74ec6b0cb2c5404ceeccef55adf94e` 的 push 37087663932／PR 37087667022 成功；兩份 logs 均包含 PGlite 14 tests、真 PG17.6 原三個 typed/typed Lock overlap、39 scanner/API、6 Review、14 save-intent及 1280/390 各 22 真下載；Preview `CE4aQ6ZDS2q6m3BwBvz6fMp3SZK9` Ready。先前本機缺 image 的三案證據已由 CI 補齊，無需 Owner 處理本機環境；但不取代以下新回歸。

先只加入回歸後執行 `node --test supabase/drafts/first_result_save/offline.test.mjs`：15 PASS／2 FAIL（含外層；URL 群組失敗）。`https://:/`、`:99999` 等完整重綁 original/final URL、citations、page receipt 並重新計算 content digest，仍被舊 SQL 接受，故失敗不是因 stale digest。沒有網路請求，這是格式契約缺口，不稱為 SSRF exploit。

Trim 的原寫法在本機**沒有重現**：直接查得 PostgreSQL 18.3（PGlite 0.5.8）把 `E'\v'` 解作 hex `0b`，`v`／` vv `及 whitespace-only VT 回歸均通過。修正仍改用明確 `chr(11)`，不依賴版本 escape 行為。native 腳本另以 PG17.6 執行舊 trim expression 的具體對照，要求輸出 escape hex／v／vv／VT 判定，再驗固定版；不能拿 PG18 結果冒充 PG17 重現。

候選 SQL 最小鎖變更：organization 的 `FOR UPDATE` 改為 `FOR NO KEY UPDATE`，保留同 org typed request 序列化，但容許 legacy INSERT 的 organization FK `KEY SHARE`。parent `FOR UPDATE`、等待後 membership 重查／`FOR SHARE`、owner gates、完整 request 冪等及 audit 原子性不改。舊模式與 legacy create/review 反向等待的 deadlock 是靜態風險；本機未有 PG17 實跑，不宣稱已發生遠端故障。

URL helper 改為有界的 HTTPS authority／port 解析，處理非空 hostname、IPv6 bracket、數字 port 0–65535、domain percent decoding 與 numeric IPv4 的合法／非法格式，拒絕壞 authority、overflow port及非法 host 字元。保持現有 JS 對 empty credentials、empty query/hash、特殊 HTTPS slash 寫法的判定，不修改儲存 URL、不抓取或做 DNS。測試有 51 個合法／非法案例（含 Unicode/punycode domain、IPv4／IPv6、空／上限／超界 port）；這是該輸入集合的 differential 證據，不宣稱已完成整份 WHATWG／IDNA conformance。

最終本機 PGlite：**16 群組 PASS，Node 含外層 17 tests PASS／0 FAIL**。新 trim 群組比對 JS trim 的全部 whitespace 集合與有效 v 文字；完整 RPC 保留 `v`／` vv `原字串，拒絕只含 U+000B。URL 群組每例同時比對既有純 save-intent 判定、SQL helper 與完整 RPC 行為。舊相關 SQL 群組保留，沒有重跑無關 scanner／Review／UI suites。

native.mjs 保留原三個 typed/typed 案例，新增以下真多 backend assertions，均只在一次性合成 PG17.6 容器內：

- 原 `FOR UPDATE` 對照只替換隔離 impl 的 org lock clause；legacy create及review 各要求一方 40P01、一方成功，兩方交易回滾。恢復候選 `FOR NO KEY UPDATE` 後同兩案要求都成功、沒有永久 append/review；這些控制不能在遠端執行。
- 保存等待 org lock 時，另一交易提交 membership 刪除：新 request及既有 request retry 都必須在等待後 42501，沒有新版本／audit。
- 保存先取得 membership SHARE 時，撤銷必須真 Lock 等待保存提交；撤銷提交後相同 request retry 42501。只有隔離 fixture 會還原 membership 以核對前後原資料，沒有任何遠端恢復或權限操作。
- 每案要求 holder／contender／observer 三個不同 PID 與 `pg_blocking_pids` 證據；保留原一次版本一次 audit、history／帳務與其他業務資料比對。

本機 native 腳本語法檢查 PASS；執行仍因缺指定 image 在啟動前 BLOCKED／exit 2，沒有下載、啟動容器或修改安全設定。**新增 PG17 trim 對照、兩組混合鎖修復及 membership overlap 尚待新 SHA CI 輸出／父獨立驗收，不能以之前三案 PASS 代替。** CI 沿用既有 native step，不改成功條件。未部署或啟用真保存。
