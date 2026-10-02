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
