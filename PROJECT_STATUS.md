# Growth OS｜專案進度

更新：2026-10-04（UTC；歷史段落保留原時區）。本頁是工程證據快照；產品路線唯一依據為 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)。[舊進度快照](PROJECT_STATUS_歷史_2026-10-02.md)完整保留，其舊 next step／帳號狀態不作目前判斷。

## 當前授權與基準

**現行方向（Owner 2026-10-04 06:27 UTC，Reviewer `01a1059a-5089-7374-94f0-c261041cb6ec` APPROVE）：日常 regression 不再需要 Owner 在場。** 正確repo基準 `5616220aa865d6b36073f22ec732246a88f72170`，同HEAD CI `37182179082` success。已新增[單一全自動 synthetic session＋隔離SQL驗收入口](docs/Unattended_Auth_Session_Regression_2026-10-04.md)，只改test harness／CI／證據；產品Auth、runtimeclosed與frozen原bytes不變。Owner Save→Logout→全新context/session→exact Readback→viewer/foreign RLS與permission在1280/390完成；獨立負測failclosed、部署fixture排除，以及既有PG17六項完整重用。證據分列synthetic session與SQL权限，真Auth engine明列未測；signOut僅清頁面記憶體，不宣稱server token撤銷。

bounded Review候選保留為離線資產，**等待Owner時段已撤下，不是日常regression前置条件**。真人登入只保留Auth/callback/magic-link/OTP修改、RC、重大milestone終驗、平台強制真人challenge四類；Owner只登入／2FA，其餘由Dot/Codex依當次授權操作。CoreMilestoneProgress=1（無Owner在場的自動驗收入口），maintenance連續數=0。新HEAD以同HEAD CI及父Reviewer核對為準；沒有啟用任何remote批准，P3 marker文案debt不處理。

歷史真人產品驗收基準為 `00446427d1a0e6c9ffa41d035d0704788c9eb481`，branch `feat/passwordless-workspace`／PR #19。父確認 CI `37179033070` success、Preview `FpxCKX9wyxY9doZmt7Y2Dinta1Xh` success；Reviewer `01a1055b-54f8-7751-9ce9-958aa9eee84b` 最終 APPROVE。**bounded-v2 續編保存 → cleanup/closed → 真 logout/reload/login2 → 精確 v2/v1 全 payload 讀回子閉環成立**；詳見 [2026-10-04 驗收](docs/Bounded_V2_續編驗收_2026-10-04.md)。前次 bounded v1／固定 tenant [歷史驗收](docs/Bounded_M3_Fixed_Case_驗收_2026-10-03.md)保留，不重做。

本輪新 envelope 已收尾：實際1 Save／2 login／2 migrations／2 config transitions，history總數23、原21records逐項hash不變；兩個Save entry有效ACL全closed，無待cleanup grant。兩份runtime config為schema=true/save=false、固定revision scope，closed SHA `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`。`2026-10-04T06:00:00.000Z`截止不延展，不再Save/reopen/login或沿用舊批准作新remote。

後續 docs 基準 `04e93edd2bc3a5c42e8b590877cfeb1be170429e` 已由父確認 Reviewer `01a10562` 通過、CI `37179905098` success、Preview `8cqoPREJ45k2n2JsVZZWchgXEvZR` success。依新明確 repo/offline Core 授權，已完成「已保存 URL 成果的確切版本 Review」離線垂直切片：Owner 核對原文／修改／來源／必要事實 → 沿用 content_reviews + audit 原子確認 → 新合成 session 精確讀回；新版不繼承，舊版僅歷史／未發布。詳見[實作、驗證與 remote 缺口](supabase/drafts/url_review/README.md)。CoreMilestoneProgress=1（離線能力）；maintenance連續數=0。

新增 5 API contracts、7 SQL 子檢查、5 native PG17 並發情境、1280/390 各12 UI 情境 PASS，受影響回歸 PASS；候選未安裝，runtime Save／Review 均維持關閉，frozen artifact／closed bytes 不變。本離線Core與CI順序修復後續已由父Reviewer核准（詳下節）；其最新CI狀態與下一候選準備以該節為準，不以本機 PASS 代替雲端驗收。完整 M3、100cap 恢復、remote URL 專用 Review、Publish／Measure仍未完成，不宣稱 live 故障注入。P3 debt：共用 marker 拒絕訊息沿用「續編／保存」字樣，待统一文案時處理，不阻塞本次。下方保留歷史過程，舊基準／批准不取代本節。

## 2026-10-04 bounded Review 候選準備（repo/offline）

正確基準 `2444bd17000e2512f7674367d163e1dd22ed887a`；父確認 Core `15a3706` Reviewer `01a10573` APPROVE_WITH_DEFERRED_DEBT、CI順序修復 Reviewer `01a10575` APPROVE。Preview `DexsE872VFnbb6zDUY5xDLg3SpRa` success；父提供的 CI `37180934357` 尚為 inprogress，未宣稱success。依後續明確Core授權，現已備妥[既有v2的完整bounded Review候選包](supabase/drafts/url_review/bound/README.md)：cutoff=null，固定新request `1f3f43cb-a64c-4739-a4a7-772d5b2cb781`，2 tracked migrations／2 config／2 login／最多1 Review POST與1review+1audit，0Save／parent／version。包含最小schema/RPC/DCL、strict bound open/closed templates、manifest/hash/bind、pre/postflight與DDL/DCL authoritative reconciliation、cleanup及unknown GET-only。

CoreMilestoneProgress=1（候選完整組裝離線成立），maintenance連續數=0。5 SQL子檢查、4 bounded API contracts、5 nativePG17及1280/390各11 UI情境PASS，generic Review受影響回歸PASS；實際兩份runtime仍原Save/Review closed bytes，九檔v2 freeze不變，無任何remote操作。P3 marker文案debt仍延期。新HEAD CI／Preview／Reviewer待父核對；該候選的live時段等待已依Owner新方向撤下；後續若另指定live驗收，仍須完整新批准。本次不綁真cutoff、不寄信、不開窗、不沿用舊06:00 envelope；完整M3／Publish／Measure仍未完成。

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

URL-to-source／產品事實與成果預覽已接線；快照 SQLite 仍為本機／Preview 暫存，100cap生命週期未解；固定成果的v1/v2含來源payload已真保存並跨登入讀回，一般產品來源永久保存尚未全面驗收；不再把通用計畫保存／工作卡 UI 擴張當第一優先。具體放行條件與依賴見唯一藍圖，不在本頁另排 M0–M6。

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

## 2026-10-03 M3 真保存／重新登入成果與必要 tenant 驗收補口

父端提供、Reviewer 總驗 `01a10328` 核對：18:26 既有 Owner login1，18:48–49 唯一一次 Save；18:50 authoritative 證明固定 parent `9bafbb2f-eea7-48ea-bc23-3896897f19c3`、request `4d602b3f-272f-4282-9906-b0cc0155e1c7` 對應 1 parent／1 version／1 audit，version UUID `4595e34a-0b2d-4a73-984b-d7439b52325c`，payload/request digest 吻合。cleanup、ACL/history、資料 preservation，以及 logout→login2→精確 readback 已獲證實。closed config commit `e645de8b97c0d40aa52ee2843e15f3d6a120b934` 保持 schema=true/save=false；原 19:30 UTC SQL lease 不延展、不再 opening 或 Save。

CoreMilestoneProgress：本輪從離線候選進展到真保存、跨登入讀回與 cleanup。完整 M3 **尚未完成**：Reviewer 判必要 P2，缺同一 signed Owner 對確有資料、但無 membership 的 OrgB negative GET。父 19:08 authoritative SELECT 已證 OrgB parent `93a88055-0a0b-40c0-b22f-a6d3123c0002` 存在，該 Owner 在 OrgB membership=0；舊 viewer 控制不能替代此驗收。

本次 Blocking 修復僅提供固定 Owner／OrgA、schema 開/save 關的唯讀診斷，沿用既有 authenticated client。OrgA 精確 1 row 是正向控制，OrgB 成功回應 0 rows 才能通過；HTTP/網路/格式錯誤不能當隔離 PASS。固定最小欄位與 IDs，無任意輸入／token 匯出／POST／新 fixture、DDL 或 ACL；登出與晚回覆失效保護保留。合成 API/UI 證據不替代待執行的真 signed negative GET。

依父轉述的 Owner 17:26 envelope（`Sentinel_10d81d4907e0819193fc417ce458fc71`，含 CI/E2E/login/logout/readback/tenant 驗收、至 M3 完成），最小操作計畫明確修訂：增加 1 次既有 Owner login，**累計 3 次**，追加 1 次唯讀診斷 Preview 部署。這超出原 manifest 的兩次登入／兩次 config 部署計畫，並非宣稱仍在原預算；不增加 Save／DB mutation，不延展 SQL 技術 lease。父於確需人工登入時通知 Owner；此 executor 未操作遠端或登入。待 CI／既有 Reviewer／Preview 核對後，由父完成這唯一缺口，再判定 M3；不啟動其他功能。

本地驗證：23 API／marker tests 通過；新增固定 Owner 診斷 UI 1280/390px 通過 positive/negative/error/leak/wrong actor/logout-late-response、零 POST；原 typed UI 1280/390px 回歸通過。新 UI 已接既有 CI。兩份 runtime config 仍為 reviewed closed SHA256 `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`；所有 SQL／payload 未改。新 HEAD 的 CI、Reviewer、Preview 與 live negative GET 待父端確認。


## 2026-10-03 19:27 UTC bounded M3 fixed case 收尾

本段更新上述「尚缺 negative GET／待 CI」的歷史狀態。父在 `19:27:19.973Z` 的第三次真 signed Owner session 點一次已審核診斷，OrgA 固定 parent 精確 1 row，OrgB 既有 parent 成功回應 0 rows；結合 19:08 authoritative 存在性／無 membership 控制，必要 P2 已解除。Reviewer 最終 APPROVE，且父已通知 Owner 此完整子里程碑成立；不是全產品 M3 或 v2 專案完成。

[驗收記錄](docs/Bounded_M3_Fixed_Case_驗收_2026-10-03.md) 保存完整 IDs、時序、1 Save／3 login、DB history 21／ACL closed、證據來源及未驗範圍。CoreMilestoneProgress 是使用者真保存後可重新登入讀回同一成果、固定 tenant 隔離已實測；本次文件 commit 本身不另計產品能力。下一 Core 僅提出既有成果續編／取消恢復的離線切片供父分配，不重做已 PASS、不新增診斷或處理 P3。


## 2026-10-03 已保存成果續編／取消恢復：離線 Core

父接受 `7563bd2` 文件（Reviewer `01a10343`、CI `37148329617` success、Preview `AkEUDCrgq54cYkoSeBTP4U959rYm` success）後，明確分配本次普通 repo/offline 工程。現在 Owner 可从已保存最新 URL draft 精確讀回進入既有 Review 引擎；保留來源、原建議及已存修改，清除舊確認；取消回到原已保存版本。viewer 仍唯讀，進入／確認重新核對最新版本，來源／tenant／session 漂移與晚回覆拒絕。沒有新 store、schema、ACL 或 Save 接線。

本地 32 unit/API/mirror tests、新續編 E2E 1280/390、既有 typed 及 URL Save 合成 UI 回歸通過；新測試接入既有 CI。詳見 [離線驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md)。closed config／所有 SQL／frozen payload 未改，既有遠端 1/1/1 保留且未觸碰；没有 live POST／login。CoreMilestoneProgress 是已保存版本可安全開始本頁續編並取消恢復的離線能力，不計為第二輪 live M3 驗收或完整 M3 完成。


## 2026-10-03 續編的新版本保存意圖（repo/offline）

父提供上一切片 `2db5c0b0395b988abd0f3e65d51d8e3e25e993f0` 的 Reviewer `01a10352` APPROVE、PR CI `37149280839` success、Preview `6LAs5AnjEuyGxqqWfNbNoKMDiUpc` success，並分配本次最小 Core。續編確認後現在可準備新的保存意圖；沿用 URL Save 五欄 request，綁定已存 base UUID、expected version、重新核對的 actor 與本地 intent digest。意圖不是保存、owner approval 或發布授權。

建立前重新 GET 同一 Auth user／Owner membership、URL parent、最新版本及精確 payload，拒絕錯 actor/org/UUID/version/source、malformed、過期 base、取消或替換 session／晚回應；來源與原建議完全保留。修改使舊意圖消失，取消回到原已存版；不鎖住跨 session 未來變更。`saveUrlResult` 仍 closed，不新增 store、SQL、schema、ACL 或 dispatcher。

27 API／marker／mirror tests、新版意圖 UI 1280/390 通過；既有 URL SQL isolated PGlite 10 tests 通過，新增組裝驗證使用實際產生的 intent 追加 v2、相同 request 冪等返回、v1 保留、舊 base 拒絕，隔離資料量 1 parent／2 versions／2 audits。這不是改動遠端既有 1/1/1。原生 Date 的測試轉接層已改為真 JSON roundtrip 後 PASS；沒有變動 SQL 契約或部署包。詳細限制見 [續編驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md)。新 HEAD CI／Reviewer 待父核對，沒有 remote/login/live POST 或 lease 延展。


## 2026-10-03 完整續編保存／精確 v2 讀回（offline，runtime 仍 closed）

父確認 `101185d229f75c0370d6781e9fc248a5f49f437a` 已由 Reviewer `01a10360` APPROVE、PR CI `37150266068` success、Preview `C3fbf5TPnERXbcEeQYXxTkzxTJ6o` success。依下一最小 Core 分配，現已把同一續編 editor／意圖接到既有 `saveUrlResult`、隔離 SQL 及精確 v2 reconcile；沒有新增意圖層、store、SQL 或通用 retry 系統。

保存前重新核對 actor／Owner membership／base UUID／expected version／完整 payload 與意圖摘要；最後仍走既有 Save flag、bound gate、session／同步 live guard。合成回應成功後必須精確 UUID、creator、org、request、版本、draft status、payload 讀回吻合才顯示 v2 成功，v1 仍保留。已送出結果未知或衝突只查原 request、不重送；衝突保留修改供複製／核對並停用保存，不自動換新 base。取消已送出操作只停止等待，不能宣稱回滾；仍可 GET 核對已提交結果。

28 API／marker／mirror tests 通過；新完整 UI 1280/390 各 success、unknown、SQL conflict、cancel、logout、wrong-readback 六案通過，每案僅一個 synthetic POST、isolated 1 parent／2 versions／2 audits、v1 原樣。既有續編／意圖 UI、URL Save 與 12 races 回歸通過。這些是 synthetic transport＋disposable SQL 的 offline 結果，不是第二輪 live Save；兩份 config exact closed、所有 SQL／bound artifact 不變，沒有 remote/login/live POST／費用／lease 延展。新 HEAD CI／Reviewer 待父核對，完整 M3 尚未宣告完成。


## 2026-10-03 v2 保存後新 session 恢復與 v1 歷史（offline 完整流程）

父提供 `e7209e7ee1e77bf6c73a594cad4296f29ca35623` 的 Reviewer `01a10370` APPROVE、PR CI `37151322250` success、Preview `HHaXKYiwoVZ7Eqjiybyns2reWzDg` success。先檢查既有產品能力：dashboard 已依 DB 版本建立最新／歷史清單、按 UUID lazy GET、Owner 最新 draft 才能續編，結束 session 會清除舊 DOM。新整合測試證實這些能力足以完成本 slice，**沒有產品缺口需要新程式或新 store**。

擴充同一 `saved-result-save.e2e.mjs`：真 DOM 合成保存 v2 後結束 session、關閉舊 browser context、以新 context／新合成 token 登入同一 isolated DB，精確 v2 UUID／完整 payload 及 v1 完整 payload 讀回；僅 v2 有 Owner 續編入口。再以新 viewer session 驗兩版唯讀、新 foreign tenant session 驗既有成果不可見，並驗錯版本回應／登出後 late detail 不渲染。1280/390 均 PASS；每 viewport 僅原一次 synthetic POST，新 session 全 GET，DB v1 全 row 不變、維持 1/2/2。不是重新執行 live 登入，也不是新 runtime 功能宣稱。

M3 的已完成使用者閉環與剩餘項已集中列於 [續編驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md#m3-使用者流程收斂與剩餘項)。本輪 CoreMilestoneProgress 是完成跨新 session 的整合證據，不另拆更多已 PASS 成功路徑。主要剩餘 repo Core 是「unknown 保存後離頁／新 session 的安全核對與成果恢復」；只提出一個完整流程供父分配，不在本輪展開。現有 editor 生命周期限制仍在，不能據此 live rollout；遠端 fixed-case envelope 已收尾，仍禁止新 remote/login/mutation。P3 不追，完整 M3／Publish／Measure 未完成。


## 2026-10-03 同 origin/tab 未決續編恢復（一次完整 offline Core）

父確認 `ea87cc0acaa45a9120f5fde9c0aedcec68c2c402` 的 Reviewer `01a1037d` APPROVE、PR CI `37152160413` success、Preview `48jS9KPVHYhA4ZdMJ9wqWngcAQNm` success，分配同 origin/tab 跨 editor、reload、logout/login 的單筆 unknown 恢復。本輪在既有 sessionStorage marker 模組新增獨立 revision key，原 fixed-trial 函式 bytes／key 與 frozen artifacts 不變；不建立其他持久 store 或通用重試框架。

dispatch 緊前同步寫入／讀回核對單筆識別與摘要，storage 拒絕／no-op／損壞 fail closed；token、payload、修改文案均不入 storage。未決 request 不可換號，連既有一般 URL append 入口也不能繞過重送限制。跨 editor／reload／logout/login 後只有原 request／known UUID GET，依重新核對的身份、membership、base、版本、來源及 payload／intent 摘要恢復；空 GET 維持 unknown。成功精確核對後才標 resolved；晚 ack 不可覆寫下一筆 metadata。

32 API／marker／mirror tests PASS；1280/390 完整組裝 28 案（既有 14＋本輪恢復／storage 14）PASS，含已提交 unknown、未提交空 GET、known UUID mismatch、錯 actor、損壞 pending reload、拒絕／no-op storage；恢復不新增 POST、v1 完整不變。既有續編及 URL Save 桌面手機回歸亦 PASS。初次合成新登入失敗因同頁僅改 hash 沒有 document load，已改同 tab 真導頁後通過，沒有放寬身份防護。

明確限制：僅同 origin／仍存在的 tab；不保證 destroyed tab/context、跨設備或人為清除 sessionStorage。未落庫文案只留原 editor 記憶體；reload 後若 GET 空，不能用摘要重建修改，必須明示 unknown；若已提交，從精確 DB payload 恢復修改。已解本輪限定恢復流程，不能因此宣稱全面 live rollout；新 v2 remote／完整 live role matrix 仍未驗收，實際 Save closed、舊遠端 envelope 已收尾。沒有 remote/login/live POST、新 SQL、ACL、費用或 lease 延展。詳細 scope 見 [驗收記錄](docs/Saved_Result_Review_離線驗收_2026-10-03.md)。


## 2026-10-03 新 bounded v2 驗收準備（offline candidate only）

父確認 `495516b71d20bd975f6f1afa88eb160883409160` Reviewer `01a1039a` APPROVE、PR CI `37153710795` success、Preview `BTuUpxFXMNHJJU7EVK8dQnNMk6NX` success。新 Core 收斂為已保存 v1 真續編一次 → 新 bounded v2 保存 → 重登入精確 v2/v1 history；原 first-case envelope 已收尾，不能沿用舊批准。

已交付 [完整候選與安全順序](supabase/drafts/url_result/revision-bound/README.md)：固定原 Owner/org/parent/base，唯一新 request，既有 Review engine 從原 payload 產生 frozen v2，expected1；僅既有 private implementation 窄patch template＋保留資料的tracked cleanup＋readonly pre/postflight。cutoff=null，不猜 Owner 可用時間、不做短期freeze。隔離PGlite 7 tests PASS，驗基準漂移、錯bound、到期rollback、最大增量0parent/1version/1audit、v1全row不變和closed讀回。

CoreMilestoneProgress：新 bounded v2 的可審核 scope／payload／SQL 離線可行性成立，尚未形成 live 使用者驗收。現有 trial 預期0而續編入口要求無trial，需最小revision discriminator接線與desktop/mobile/nativePG驗證後才可由父整包向Owner請新批准；本輪未實作runtime接線，不能直接開旗標。沒有新架構、remote、login、live POST、實際config或既有frozen artifacts變更。準備結果交父review，不自動開始遠端或其他Core。


## 2026-10-03 bounded-v2 完整 repo 整合（未遠端啟用）

父确认 `d5f1eb11a04d2e17808559fa767fc4e0db3bca55` Reviewer `01a103a8` APPROVE（僅候選準備）、CI `37154980520` success、Preview `PzDAAkV8a8RJXUVY4BG3ZV6FbUtx` success，再授權完成同scope整合。本輪 `kind:revision` 固定 expected1/base UUID/request/full payload/intent，沿既有config/editor/API，保留firsttrial；不設trial=null泛開、不新增store/framework/意圖層。revision trial不建立firstSave匯入面板；generic Save無法繞過saveUrlRevision，resolved固定request也不可再次POST。

CoreMilestoneProgress：同一v1→單次title edit→精確意圖→一次synthetic POST→unknown原request GET-only→cleanup/closedconfig→logout/reload/login2→exact v2及v1 history 的完整bounded流程已離線成立。1280/390共16案PASS（成功與unknown至多1 Save POST、每案恰2 synthetic OTP requests）；一般續編28案與舊firsttrial4組回歸PASS；API/marker/mirror/候選42tests PASS。固定PG17.6原生6組鎖/截止/並發去重/到期重放/撤權讀回驗證PASS，v1不變；本機缺image時先取得與CI相同公開pinned依賴，容器network=none且無hostports，沒有遠端Supabase操作。

[完整包與操作順序](supabase/drafts/url_result/revision-bound/README.md) 修正為open部署/reload後login1；Save後先SQLcleanup與closedconfig部署，再logout/reload/login2，沒有把頁面記憶體session假設成跨reload持續，也沒有隱含第3次登入。完整open/closed候選config、SQL模板/hash、pre/postflight及離線bind工具已備；cutoff仍null/template，綁定前不能dispatch/remoteexecute。actual runtime config兩份仍是原closed SHA `c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511`；舊frozen包/已部署SQL未動。待新HEAD Reviewer/CI後父一次提交Owner新envelope，本輪不remote/login/livePOST，M3真v2驗收尚未成立。


## 2026-10-04 bounded-v2 驗收收尾與 debt

CoreMilestoneProgress：最近24h已從offline續編推進到一個真signed Owner的v1→v2保存、closed後新登入精確讀回兩版，原v1全row／來源保留；不是以commit/test數代替進度。本次docs只歸檔父與Reviewer證據，不另計一項產品能力。Save `05:06:20.121475Z` → v2 `5802e838-8a06-46c6-934a-0a8c38ba1daa`；`05:19Z`兩版全payload讀回。增量0parent/1version/1audit，排除精確新兩row後24投影count/hash一致；metadata/RLS/ACL不變、46functions僅批准privatebody變動。完整身份、hash、兩次登入與migration時序見[驗收記錄](docs/Bounded_V2_續編驗收_2026-10-04.md)。

| 項目 | 分類／目前狀態 | 再處理條件 |
|---|---|---|
| historical/runtime fixture耦合CI failures | Blocking已解除；`ccfc81b`／`ba430665` test-only RCA/SYSTEMIC_FIX，最終closed CI全通過 | 新harness須沿用explicit synthetic config；不列未解blocker、不另開維護工程 |
| URL專用確切版本Review | 下一個Core；page-only確認／draft保存不等於權威版確認，現行URL card仍待專用審核 | 按新記錄的一條完整offline流程與四項驗收條件實作；不重做bounded Save |
| 100筆SQLite來源快照滿額恢復 | Deferred已知限制；滿額仍拒絕新snapshot，匯出不釋放容量；既有成果保留已驗 | 當後續來源流程需要第101筆且有明確儲存生命週期scope時另處理；不自行刪資料／換架構，本次v2保存未解此限制 |
| unknown跨destroyed tab/context／跨設備，及live故障注入 | Deferred範圍界線；同origin/tab恢復已有offline證據，本輪無live故障注入 | 真實使用需求與新的核定範圍出現才重看，不擴store/retry系統 |

P3/P4不阻塞已驗收子閉環，不搜尋其他edge cases；完整live角色矩陣、真客戶品質、Publish／Measure保留為各自主線驗收，不能由本輪PASS推定完成。
