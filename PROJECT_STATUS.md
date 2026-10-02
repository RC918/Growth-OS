# Growth OS｜專案進度

更新：2026-10-02（台北）。本頁是工程證據快照；產品路線唯一依據為 [執行藍圖 v2.0](docs/AI_Company_Growth_OS_執行藍圖_v1.md)。[舊進度快照](PROJECT_STATUS_歷史_2026-10-02.md)完整保留，其舊 next step／帳號狀態不作目前判斷。

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
