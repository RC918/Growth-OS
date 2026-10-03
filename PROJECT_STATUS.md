# Growth OS｜專案進度

更新：2026-10-03（UTC；歷史段落保留原時區）。本頁是工程證據快照；產品路線唯一依據為 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)。[舊進度快照](PROJECT_STATUS_歷史_2026-10-02.md)完整保留，其舊 next step／帳號狀態不作目前判斷。

## 當前授權與基準

目前HEAD沿 `c911d4fc` 已驗收基準推進，6663只屬歷史。Owner新M3隔離工程envelope來源 `Sentinel_10d81d4907e0819193fc417ce458fc71`：服務Save→Logout→Login→Readback→權限/tenant驗證，至M3驗收完成失效；不是v2專案Completed。已repo準備 [19:30 UTC execution manifest](supabase/drafts/url_result/bound/owner-candidate-20261003T193000Z/execution-manifest.json)，保留固定IDs/payload/最多1Save與1/1/1，僅重綁技術截止2026-10-03T19:30:00Z，cleanup不變。候選待Reviewer/CI；本輪無remote或runtime enable，兩config仍false/false/null。

舊opening `url_result_bound_open_20261003_1430` 的receipt遺失及後續安全拒絕均保留；新Owner envelope不是繞過平台拒絕的許可。父先同正式route核可執行性及fresh authoritative reconciliation，仍拒絕即停。改截止是artifact revision而非相同SQL重試；未知舊operation未核清不得dispatch新revision，已套用不重播，STATE_DIVERGED停mutation。原14:30已過期、舊快照不代表目前遠端狀態。後續最小預算2migration/2config部署/2既有登入/1logout/最多1Save/0fixture mutation；具體pre/postflight、收尾與tenant驗證見候選README。

## 產品方向

URL → First Useful Result → Review → Publish → Measure。電商／貿易商產品頁優先；網址主入口，自動理解與分析，必要缺口才問。第一成果為帶來源、可套用的產品頁 title/meta/描述改善包。plan/work 是內部治理，不是一般使用者的第一價值時刻。

## 已完成的工程資產

基準 `8a4591b`、分支 `feat/passwordless-workspace`、[Draft PR #19](https://github.com/RC918/Growth-OS/pull/19)。同 SHA [push CI](https://github.com/RC918/Growth-OS/actions/runs/36953102738)／[PR CI](https://github.com/RC918/Growth-OS/actions/runs/36953106748) 及 Preview checks 成功。包含既有 unit／integration／desktop-mobile 回歸、新增 plan/session 19 項測試與離線計畫 E2E。未合併，沒有已驗證的客戶發布／流量成效閉環。

| 資產 | 證據／可重用範圍 | 目前限制 |
|---|---|---|
| Auth/RLS、tenant、版本、approval/audit、固定引導 | [歷史 M1 驗收](docs/Goal_Intake_M1_驗收_2026-09-30.md)及既有 CI | 新成果／發布整合仍需遠端驗收，不重跑既有 PASS |
| 公開 scanner、CSV 與 observation | prototype/public-audit、prototype/csv-import 及 CI | URL 安全入口已接最小預覽；真實量測鏈未接通 |
| 草稿 review、unwired adapter | 0a36de7 與後續 CI，來源／版本／scope／race 回歸 | adapter 未啟用，remote save 未驗收 |
| plan/work-card 契約／memory session／離線 UI | 2d8f7c3、13b7bad、559c033、8a4591b；[證據](docs/Growth_Plan_M2_離線契約_2026-10-02.md) | 改列內部治理／驗收資產；不等於新版 M2 第一可用成果 |
| 靜態 Preview | 同 SHA 部署成功 | 雲端互動未完整驗收，不能代替發布產品內容 |

## 進行中與待完成

藍圖 v2.0 已由 Owner 確認（08dbbb7）。目前新增 M1 安全 URL／Source Snapshot／Product Facts 與 M2 第一可用文本預覽最小切片；24 項 scanner/API 回歸及 desktop/mobile E2E PASS，詳見 [驗收紀錄](docs/URL_First_Result_驗收_2026-10-02.md)。新 M1 URL 安全理解、新 M2 可用成果、新 M3 review 接線、新 M4 單平台發布、新 M5 可信效果、新 M6 試點閉環均未全面完成。沒有以舊 M1/M2 同名驗收直接放行新里程碑。

URL-to-source／產品事實與成果預覽已接線；快照 SQLite 為本機／Preview 暫存，跨登入永久保存尚未完成；不再把通用計畫保存／工作卡 UI 擴張當第一優先。具體放行條件與依賴見唯一藍圖，不在本頁另排 M0–M6。

## 真正限制

試點產品網址、發布平台及站點／數據授權尚未建立閉環；它們在 live 整合階段需要對應資訊／登入，不阻擋離線契約與固定 fixture 工程。無真實資料顯示未知，不宣稱 Growth。

package.json 未配置 build/lint/typecheck scripts；Vercel echo build 不是三項品質 PASS。已有 CI／E2E 才是證據。既有 .DS_Store 不納入提交。保持 Growth OS 獨立環境，不改 production、morningai、owner-console、正式網域、模型限額或付費設定。

## 2026-10-02 transport 修復切片

基準 `6663b7f` 的 SafeURL／SourceSnapshot／ProductFacts／FirstUsefulResult preview 與 desktop/mobile PASS 保留。新增重現並修復 HTTP status/header/chunk-header 慢速滴送超過共用 deadline 的缺口；26 項 scanner/API 回歸 PASS，含真 HTTP parser 與本機 socket 測試。詳見[驗收增補](docs/URL_First_Result_驗收_2026-10-02.md#http-parsing-deadline-follow-up-2026-10-02)。新 HEAD CI／Preview 待父獨立核對；PR API Forbidden 不重試。

已重現、尚未修復：main/article 配送／別品文字可能被列為產品事實；100 筆快照後匯出不釋放容量，UI submit/input 清除目前成果，恢復路徑未驗收。下一品質切片優先限制事實與目標產品的關聯；不擴通用 plan/work-card。跨登入保存、SSO 互動、真產品品質與完整閉環仍未驗收。

後續同一 deadline 契約：父已驗收 `1ec65b42`，push CI 37032327865／PR CI 37032335907 與 fresh 1280/390 E2E PASS。再重現 TCP/TLS/send 各自沿用 5 秒導致總計 6–7 秒；本次改共用剩餘期限，28 scanner/API tests PASS，含正常階段、失敗關閉及真 TLS 停滯 elapsed 驗證。新 commit 的 CI／PR 描述由父核對同步；產品事實與容量修復維持獨立切片。

產品事實歸屬切片：已重現配送／別品污染與多商品歧義，改為要求描述／特性與單一產品名稱同屬明確 Product microdata scope；無歸屬、矛盾描述／名稱安全降級。31 scanner/API tests 及 fresh 1280/390 URL E2E PASS；保留快照與引用並加產品 scope 證據。這縮小支援頁型，不宣稱任意未標記頁或真產品品質已驗收。容量／目前成果保留仍待下一獨立切片；本輪不處理。詳見驗收文件 Product fact ownership 增補。

成果保留／容量提示切片：新輸入、失敗、unsupported、取消不再清除最後成功成果；顯示其來源／版本，Copy／Export 保留原始 snapshot，請求錯誤不被匯出提示蓋掉。重複提交與舊 async 回覆有 epoch 防護。32 scanner/API tests 與 fresh 1280/390 E2E PASS，含鍵盤、實際 clipboard/download、版本/hash 及 100 筆 SQLite 逐筆不變驗證。滿額仍拒絕新保存，匯出不釋放容量；未刪資料，真正解除容量待儲存生命週期決策。本頁記憶體保留不等於跨登入／重新整理恢復。詳見驗收增補。

CI 更正：`f0acf9c` 的 push 37036557523／PR 37036563999 均在第 11 次下載失敗，不能以先前本機 PASS 視為已驗收。已確認 Chromium 的 10 次／1 秒下載 burst 限制：實際頁面 49.37 ms 觸發 11 次僅 10 次下載，超過 1 秒後恢復。只修 E2E 下載節奏，保留全部鍵盤／內容／hash 斷言並要求每 viewport 12 次真下載；fresh 本機 1280/390 PASS。CI 145 瀏覽器安裝遭 CDN 403，本機用既有 151；新 HEAD CI 仍需父驗收。產品程式未改。

真頁品質有界評估（2026-10-02 17:08 UTC）：父已確認 `8f1f17c` 兩組 CI 37037554882／37037562443、Chromium 145、32 scanner/API 及 1280/390 各 12 真下載 PASS，原 CI blocker 解除。最多 3 個公開示範商品 live 本機嘗試均停在 robots（2 DNS 失敗、1 次 5 秒 timeout），0 商品頁／0 snapshot／0 preview，不能宣稱真產品品質或 unsupported 分類已驗收。已保存[短記錄與 Preview 最小驗收方案](docs/Public_Product_Quality_2026-10-02.md)；沒有改抓取限制或功能。下一步需父核對精確 Preview head、Owner 自行完成既有 SSO 後的窄範圍驗收；無新登入設定、清理或儲存架構變更。

父的受限 Preview 觀察：17:37 核對 `3ad934a`／deployment `GQKPriANVwhGWtoickXj2s8rCdZa` 與 alias；兩次指定 URL 提交分別 robots 停止與名稱已識別但描述歸屬不足，UI/request/fallback 有證據，真有用成果仍未通過，snapshot 寫入數未知。依父唯讀 WooCommerce DOM 證據，新增狹窄單產品 summary/title/short-description 歸屬路徑，保留 microdata／引用，歧義降級；35 scanner/API tests、fresh 1280/390 各 13 次下載 PASS。這次只有合成 fixture／本機回歸，真 ScrapeMe 重測待父另處理授權，未追加 live 請求。詳見真頁評估與驗收文件增補。

Woo／microdata 重疊 review 修正：`874d071` 原 CI 綠燈不涵蓋優先序 regression，父暫未驗收。已重現後修為保留有效 microdata，Woo 只補缺值且不丟 features/citations；visible name 或跨格式描述衝突安全降級，空 Woo 描述不覆寫有效 source。38 scanner/API tests、fresh 1280/390 各 15 真下載 PASS，含 mixed 成功與衝突保留舊成果。無額外 live/model 請求，新 HEAD 待父獨立 review／CI；真頁品質未新增 PASS。

首次 live Preview 成功（父證據，2026-10-02 23:52 UTC）：核對 `9874e6b`、兩 CI success 與 deployment `H7TGnzpVFaaYXSuUuSkKyitrKs64`／alias 後，單次 Bulbasaur 得到三份文本與可追溯引用；fetched_at `2026-10-02T23:52:48.839429+00:00`，fingerprint `fb43e63ad4cda608d8ee1edb4ac4614e04652f56b233ae0be31cc5d191ac4361`。詳見真頁評估增補。雲端 Copy 讀回空、Export 等待發生工具 kernel timeout，內容／檔案未獨立驗證；不先判為產品 bug，不代表全 M1/M2／發布／流量完成。

合成重現後修正描述已以完整產品名開頭仍重複加名前綴；保留原句、facts 與引用。25 項受影響 Product/API tests、fresh 1280/390 各 16 次真下載 PASS；未重跑無關 suite，未改 Copy/Export 實作，未追加任何 live／模型請求。新版 CI／真頁修復後品質仍待父核對。

## 2026-10-03 第一成果本頁 Review

父已獨立驗收 `821aab584a295843a588c09d8fdf33d4e0619d37`，push CI 37080100879／PR CI 37080104447 success，Preview `5kCwsw8Xc1yXN8rjFiAfYsKGzPEp` Ready。本次在該基準接通三欄原地編輯、相關事實核對、取消還原與版本確認；編輯／來源變更撤銷舊確認，延遲操作不能覆寫新版本。Copy／Export 使用目前可見版本，保留來源 bytes hash，內容 digest 與本頁確認另列。明示本頁已確認／未保存／未發布，不作權限或永久保存證據。

契約 6 tests、受影響 API 3 tests、最終 1280/390 E2E 各 22 真下載 PASS；最後程式驗證後僅補文件，未重跑無關 PASS。詳見 [Review 驗收](docs/First_Result_Review_驗收_2026-10-03.md)。新 commit CI／Preview 待父獨立審查；沒有新增 live／模型／遠端 DB／Auth 操作，完整 M3、持久保存與發布／量測仍未完成。

父已接受本頁 Review `1a21d5486c1640b591aa686944767d99d208b307`：push 37082152873／PR 37082156670 success；logs 39 scanner/API、6 Review contracts、Chromium 145 1280/390 各 22 真下載，Preview `ErnefHeALQZuKdtatikv6CGHDcNx` Ready。本頁確認仍非持久 owner 授權。

後續最小切片僅新增未接線 First Result save-intent 純契約／validator：完整保留匯出與獨立 fixture context，重算來源／內容／完整請求摘要，缺映射或資格拒絕；輸出只 draft candidate，明示 legacy title 160／title-body 與三欄 2000／來源 Review 不相容。11 項針對性合成測試 PASS；新 CI 待父核對。沒有 migration／RPC／generic review 改動、adapter dispatch、Auth／UI 接線、remoteSave 或新 store；不把完整 Business Profile 帶回 URL onboarding。詳見 [save-intent 契約與限制](docs/First_Result_Save_Intent_契約_2026-10-03.md)。

save-intent 父審查修正：`69ce9b1` 兩 CI 37083625550／37083629483 綠燈但 HOLD，因必備 evidence 可缺漏及長 Unicode 原建議誤拒。先補回歸重現 11 PASS／2 FAIL（114 個結構破壞案例中 80 個誤收、真 builder 長原建議 INVALID_FIELD_SIZE），再最小修為完整 producer typed evidence／unknown 檢查，2000 限制僅用於目前編輯欄。最終 14 tests PASS，原建議／來源無損，合法 Woo／microdata／usage 合成案例仍通過。僅純契約、fixtures 與文件，無遠端／UI／RPC／migration；新提交待父審查，詳見 save-intent 契約 P2 增補。

## 2026-10-03 未部署 First Result 保存 SQL 草案

父已接受 `9ea837b82a490bd2affef85e661049db431127fd` 的兩項 P2 修復：CI 37084305511／37084307932 success、14 save-intent／6 Review／39 scanner/API、1280/390 各 22 真下載，Preview `2RcV3YMjLdzmV7cPkzGwu2pjKG22` Ready。Owner 01:36 UTC 同意下一個離線 SQL／隔離 DB 切片，仍未批准遠端真保存。

新增 [未部署草案與驗收](supabase/drafts/first_result_save/README.md)，位於 migration runner 不載入的 drafts 目錄。只擴 content_versions 四欄／條件約束與 org-request 唯一鍵、owner append RPC、必要 private validators、typed generic-review guard；保留三欄／長原建議／來源、原有 tenant／門檻／共用版本與 audit。沒有新 store、Profile onboarding、Auth／UI／dispatch 接線。

PGlite 13 個群組（Node 含外層 14 tests）PASS，含 114 個證據破壞拒絕、Unicode／來源與內容摘要重算、完整讀回、冪等與異請求拒絕、membership 撤銷、audit 回滾、typed 審核拒絕及 legacy 相容；合成 20 表原欄位、13 筆歷史與帳務比較不變。PG17.6 腳本語法 PASS，但實跑因本機缺固定映像 BLOCKED／exit 2，未下載或啟動容器；真多連線競爭尚缺證，CI 新步驟待父核對。所有 SQL 只在本地合成 DB 執行，沒有遠端資料／權限變更；真 Auth／保存／一般新用戶流程仍未放行。

保存 SQL 草案父審查增補：`c9ab0d8` 的 CI 37087663932／37087667022 已補齊真 PG17.6 原三案，Preview `CE4aQ6ZDS2q6m3BwBvz6fMp3SZK9` Ready；但三項 P2 HOLD。新增回歸先得到 PGlite 15 PASS／2 FAIL，完整重綁 URL／引用／receipt／digest 後仍重現非法 authority／port 誤收。trim 在 PG18.3 未重現（`E'\v'`→0b），改用 chr(11)，保留 PG17 專屬原寫法對照。org lock 改 NO KEY UPDATE 以容許 legacy FK KEY SHARE；新增原模式 deadlock 控制、legacy create/review 混合及三種 membership 撤銷重疊 assertions。最終 PGlite 16 群組／含外層 17 tests PASS，51 URL differential 案例完整通過；native 語法 PASS，本機仍缺 image，新增真 PG17 案例待新 CI，不能當作已重現遠端故障。僅離線 SQL／合成測試與文件，未部署、未碰遠端權限或資料。

PG17 trim 判定更正：`db953e5` 的 CI 37088718035／37088720542 在錯誤控制預期失敗；父讀得 PG17.6 實際 `0b/true/true/false`，與 PG18 一致，已撤回 trim bug 判定。chr(11) 僅為明確等義寫法。本次只修 native 預期／標籤及文件，SQL 不改；URL／鎖修法已獲父靜態接受，但新 mixed legacy／typed、三個 membership revoke 時序與保留斷言因前項中止尚未執行，下游 browser／closed-gate skip。全部 assertions 保留，待新 CI 完整執行與父驗收；沒有遠端操作。

父已接受 `16ef57627fbe1409e675d60b33559990de34ffcb`：push CI 37089011426／PR CI 37089015968 success；實際 PG17.6 trim 等義、51 URL、舊鎖 legacy create/review 40P01 對照與修正後 overlap、三種 membership revoke 時序及 1280/390 各 22 次下載均通過。這是父獨立提供的驗收，解除上一段等待；仍只接受未部署離線 SQL，不是遠端保存／Auth 批准。

## 2026-10-03 Workspace typed draft 唯讀相容性

既有目前／歷史卡片新增 typed 三欄全文、原文／原建議／修改／facts／inferences／未知／引用／來源與內容不同摘要／page-only 歷史確認。typed 或可辨識但缺損的 typed 一律阻擋 generic review、兩欄修訂與執行方案，不採信混入的 approved review；legacy 保留。舊卡片、重複操作、刷新逆序、晚回覆及頁面返回有失效防護。

10 workspace API／鏡像 tests、合成 transport 的實際 workspace renderer 1280/390 E2E PASS；每 viewport 三個 legacy mutation、零 typed mutation，完整內容／長 Unicode／HTML 安全／缺損資料／混合歷史／鍵盤與無溢出均覆蓋。新 CI 步驟已接，提交後 CI／Preview 待父核對。详見 [唯讀驗收與限制](docs/Typed_Draft_Workspace_唯讀驗收_2026-10-03.md)。

遠端 SELECT 未改，fixture 刻意補入 typed 欄位，僅驗 renderer 相容性；真實傳輸仍缺 typed 辨識／按需 payload，不能宣稱跨登入恢復完成。無新 Save／RPC／Auth 接線、遠端 DB 或模型／live fetch；未部署 SQL、不擴 Profile／Plan 入口，完整 M3 仍未放行。

Typed UI 父審查 P2 修正：`1964f6e` 的 push 37089871698／PR 37089874941、typed 1280/390 與既有回歸綠燈，Preview `4sg87bsJs2ZW7EbMJeg7pBxSw8TQ` Ready，但父 HOLD create 成功訊息誤歸屬。先以 UUID fixture 重現兩 viewport 各兩案 FAIL：RPC 回 v2，但 dashboard 最新 v3 或仍為 v1，都誤貼 badge。修為捕捉回傳 version UUID，資料與 DOM panel 均精確相符才顯示版本成功；缺讀回／新版變動只中性提示，保留晚回覆失效防護。fixture 每次 pageshow 等待自己的 response render，缺損 payload 逐值核對；原錯誤 synthetic-result／v1 成功假設移除。

修正後 1280/390 完整 typed E2E PASS（正常 v2、新 v3、缺 v2、新 render 後晚回覆各案），每 viewport 六個合成 legacy mutation、零 typed mutation；API／mirror 10 tests PASS。詳見同一唯讀驗收文件 P2 增補；新 commit CI／Preview 待父驗收。未改遠端 SELECT／API／Auth／RPC，未接真保存或操作遠端。

父已獨立接受 `95a2e679a5078117011bcbfe4c1d2eb8f0665b83`：push 37090367455／PR 37090371967 各 39 steps success、無 skip；10 API/mirror、typed 1280/390 normal/newer/missing/late UUID 四案、零 typed mutation 及既有 full suite 通過，Preview `HjobjeH4qHVULe1JWNv8enHzKViY` Ready。只接受離線 renderer 相容性，remote SELECT 未變。

## 2026-10-03 單句停寫部署候選製作（當時未遠端執行）

依父已提供的唯讀 fixture／工具契約，新增 drafts 中的單一 invoker DO [候選包與完整限制](supabase/drafts/first_result_save/CLOSED_PACKAGE.md)。保留已驗 proposal 的 DDL/function bodies，只移除原交易包裝及兩行永久 authenticated GRANT；內層 exception 子交易暫授保存、固定身份與 parent 驗 1 version/1 audit、重送／拒絕／完整讀回，成功 marker 才回滾測試與 grants，外層核有效停寫／原資料後正常完成。無新 store/UI/Auth/API/刪除資料路徑，沒有 migration discovery 接線。

PGlite Node 1 test／七組檢查 PASS：固定 actor 拒絕、authenticated 下與完成測試後真正非 marker failure、過早 marker、內層回滾後最終 failure、繼承 EXECUTE 洩漏拒絕，以及成功安裝保持停寫。原 20 表投影（含 legacy draft/review）、13 history/audit、非零 ledger/attempts 與 caller role/claims 保留；測試 rows 持久 0。native 語法 PASS；PG17.6 本機缺固定映像，啟動前 BLOCKED/exit 2，未下載。新包已接既有 PG17.6 CI runner，尚待父讀新 SHA logs。

hosted applyMigration 僅 POST name/query 並回 success，不提供已證實的 schema＋migration-history 原子性；本包不聲稱解決此未知。未来需父獨立審 hash＋Owner 批准一次正式隔離 migration，預期 history 18→19；未知結果先查不重送，不刪 history／資料。未連遠端、未讀 secret、未登入、未部署或觸發模型／商品請求。


## 2026-10-03 04:10 UTC 停寫部署完成（父提供）

Owner 04:01:01 批准 03:32 提案的限定一次 remote closed deployment（`Sentinel_ae3797f439c081918dec7fa3929e6d89`）。父於 04:05–04:06 只 apply_migration 一次：project=`vhzryhibmpvglzcmfnaa`、name=`first_result_closed_package`，使用 `a150bebbe549f862c41dd93a16ea72cd4a74e626` 的 SQL，SHA-256 `6a711df72cdf5bd5700f7148aa98b1982ca1209c5b5fe2fdf48a3a1288275beb`；tool success:true。

父 04:10 獨立 SELECT-only postflight PASS：總 migration 18→19，新增 `20261003040602 first_result_closed_package`，持久 statement 52,447 bytes／hash 精確相符。15 新函式 body/signature/flags、postgres owner、empty search_path、僅 private save impl 為新 definer 均吻合；PUBLIC/anon/authenticated/service_role 有效 EXECUTE 全 false、無 non-owner grantee。四欄／約束／typed-review guard 正確；24 relation/subset count＋SHA 不變，20 業務表共 87 rows、audit 30 rows、原 goal 13 history、ledger 與 2 settled attempts 保留。Typed rows／first-result audit／測試 request IDs 持久 0。**19 是 migration 總數，13 是 goal history 筆數。**

既有 3 ancillary functions 與 review 有獨立快照比對；其餘既有 functions／PG role membership 由 exact package 內 security assertions＋apply success 支持，沒有誇稱全數都有獨立外部快照。詳見 [停寫部署紀錄](supabase/drafts/first_result_save/CLOSED_PACKAGE.md)。

唯一 remote attempt 已用完，30 分鐘窗口不是額外授權；不重跑 migration、不開 grant、不 reconcile 本地 migration filenames。沒有真 JWT/API/login/Save/跨 session 驗收，remote SELECT 仍未改。此次 agent 只記錄父的結果，未連遠端或重跑實作測試。後續 schema＋history 一般原子性仍不能由本次成功推定。


## 2026-10-03 Workspace typed 按需讀取契約

父已接受文件基準 `be01425ce4bbd3a2ab5406ee5420433ae894b256`：push CI 37096055203／PR CI 37096057823 各 39 steps success，Preview `5oedbDN14M88Xr1g9T7vZn5GCZTe` Ready（父提供證據）。此前各段「SELECT 未改」為各切片當時狀態，最新本地接線如下。

現有版本列表新增三個 scalar metadata，payload 只在使用者展開單版時以當前 org＋精確 UUID GET。回應 org/id/parent/version/metadata 與列表投影一致才顯示；metadata 缺失／矛盾 fail closed，不回退 legacy。手動重試、重複展開與收合／歷史收合／刷新／登出／session 更換／晚回覆防護保留；apps/web 與 prototype 鏡像一致。

最終程式既有驗收：13 API/mirror tests、嚴格 SELECT projection 的 1280/390 合成 E2E PASS；每 viewport 六次 legacy mutation、零 typed mutation。logs 04:35:14 晚於最終程式修改 04:35:03；收尾僅補文件，不重跑無關 suite。詳見 [按需讀取驗收](docs/Typed_Draft_Workspace_唯讀驗收_2026-10-03.md)。新 SHA CI／Preview 待父獨立驗收。

沒有遠端查詢、Save、登入、grants、SQL／migration 或新 Auth 流程；單次部署批准已用完。合成讀取通過不等於真 RLS／Data API／跨 session 恢復驗收，不放行完整 M3 或發布／量測。

## 2026-10-03 URL-first 待審保存：離線整合

父已接受 `2a33ef49e2a35cea7a35648d1dad1a12212c4f6d`：push 37097416575／PR 37097419698 全 39 steps success，Preview `defz8iRhLPEruDLNJZ4XWkHEjRHt` Ready。Owner 05:14 同意 04:55:45 的 URL 待審保存方向；不先 Profile／approved opportunity，僅設計與離線驗證，遠端另批。

新增 growth_opportunities 的互斥 URL subtype／固定待審／immutable source identity、專用原子 Save 草案，沿用 content_versions、tenant RLS、org/request 冪等、版本與 audit。首存 1 parent＋1 version＋1 audit，追加 1 version＋1 audit，拒絕／重送零新增；五個舊 mutation impl 拒 URL，新 Save 拒 legacy，舊 gate 保留。草案不在 migrations，歷史 closed-package SQL/hash 未改，新入口 EXECUTE 全 closed。

實際 product Review→同 origin 指定視窗一次 nonce 交接／完整 JSON 匯入→workspace 唯讀確認→專用 API→精確版本讀回已組裝；無損沿用 export，沒有重新建立 editable Review／demo／store。瀏覽器 dispatch 預設 false；不要求未部署新欄位。owner-only，editor/viewer 只讀；無帳號／無 membership／多 membership 不自行配置資格。未知結果只查原 request、不 retry；page confirmation 非 owner approval。

離線證據、檔案差異、完整命令與限制見 [URL 待審保存候選](supabase/drafts/url_result/README.md)。本地 46 unit/API/mirror/SQL tests、URL Save 1280/390 實際 UI＋隔離 SQL、既有 typed 1280/390 及 product 1280/390 各 22 下載回歸；PG17 新並發本機缺固定 image／exit 2，已加 CI，待父獨立驗收。沒有遠端 DB/Auth/Save/grants/live 商品抓取/模型/費用或部署操作；不放行真保存、一般新用戶 provisioning、完整 M3 或發布／量測。

URL 保存父審查 HOLD 修正：`97ce6ede23032c60e19546f3fc8975a360aad758` 的 push `37100438616`／PR `37100440301` 在 native startup 失敗，URL 並發 assertions 未到、後續 browser skip；Preview Ready 不代替驗收。原 SELECT-only readiness 誤接受 Docker 暫時 init server，現沿用既有 PID1=postgres＋SELECT 1＋PG17.6／listen_addresses 核對，合成控制 FAIL→PASS；本機缺固定 image，真並發仍待新 CI。

另先重現三項 P2：五個 SECURITY DEFINER 舊入口在 auth 前查 subtype，75 組未授權組合中 25 個 URL 目標洩漏不同錯碼；兩 viewport 八案取消／修改／刷新／pagehide 於 async digest 暫停後仍 POST，四案讀回失敗後手動對帳誤接受 RPC A 以外 UUID B。修為原 owner/org auth 後才查 type、POST 緊前同步 live intent/session guard、unresolved intent 持有回傳 UUID 並每次 GET／顯示前核對。修正後受影響 28 tests、12 個 browser 邊界案例、1280/390 原 URL 保存整合均 PASS；詳見 [FAIL→PASS 證據](supabase/drafts/url_result/README.md)。新 SHA CI／PG17／Preview 待父獨立驗收；無遠端操作，closed gates 與歷史 SQL hash 保持。

## 2026-10-03 bound URL 離線候選包

已凍結唯一合成 export、新 parent/request、actor/org 與 hashes，提供既有 URL Save impl 內固定 gate、兩份非自動部署 opening/cleanup SQL、明確 UTC／既有 Preview URL 必填 renderer，及 GET-first／unknown GET-only／fresh readonly UI。實際分支 schema/save 仍 false、trial null；未做任何遠端 DB/Auth/POST/模型操作。詳見 [候選包與證據](supabase/drafts/url_result/bound/README.md)。本機 28 tests、Chromium151 的 1280/390 bound 與原 URL E2E、12 races PASS。PG17.6 因本機缺指定 image 明確 BLOCKED、未下載；新 CI／Preview 由父驗收，實際截止 UTC、Preview alias/callback 與遠端批准仍待綁定。

## 2026-10-03 bounded 同 tab 防重送修正

父對 `6bab3bef` 指出 unknown POST 後 reload／空 GET 可重送；先在 1280/390 重現第二 POST 的 FAIL，再加入僅限本次驗收的 sessionStorage 非敏感 metadata。固定 scope/expiry/request、attempted 與 known UUID 在 POST 前同步寫入／讀回，reload/relogin 只 GET；錯誤或不可用標記 fail closed，logout/cleanup/expiry 不清除。21 API/marker tests 與兩 viewport 的 unknown／acknowledged UUID、bad storage、cleanup/expiry cases PASS；原 E2E/races 保留。SQL、候選 hashes 與 false/null flags 未改，沒有遠端 DB/Auth/POST。限定同一受控 tab，不宣稱跨新 tab／裝置的全球一次 HTTP；詳見 bound README。
