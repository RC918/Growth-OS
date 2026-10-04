# 選定成果旁檢查頁面級資料適用性｜2026-10-04

基準 `f15c1e3d23ddf598478b504226963de796daf024`，父確認 Reviewer `01a107af` APPROVE、CI `37215248021`／Preview `8KHNidTetA23nuNkWtGsYNmQ5foa` 成功。開始時以 origin 即時 ref 與 PR #19 的 head_sha 核對相同基準；本地舊追蹤 ref／PR 歷史正文中的 `6663b7f` 不取代最新明確指令，沒有回退或 reset。

使用位置：workspace → 已保存 URL 成果 → 展開確切版本 →「檢查頁面級資料適用性」。使用者選取一份頁面篩選的每日 CSV，填完整頁面 URL、搜尋類型、期間、含時區匯出時間、來源與篩選說明，立即查看適用性及資料覆蓋。未確認／歷史版本及可讀 viewer 均可檢視，不依賴真人勾選。

- 重用 `search-baseline.preview` 的既有每日 CSV 計算／驗證，標頭仍 `date,clicks,impressions`；最多 1 MB、UTF-8、1–366 日。不改網站 snapshot/report 格式，沒有新 CSV 框架或自動關聯。
- 先讀本機檔案，再重用 `readSavedUrlDelivery` 核對 org／actor／role、exact version／最新或歷史分類、完整 payload／source，僅 GET。畫面明列 org、version ID／版號與候選／聲明頁面。
- 來源只能 synthetic 或 provider_asserted；欄位嚴格白名單，不接受 verified 或 publication 欄位。URL 以完整 URL（保留 path/query）比對，吻合只代表聲明相容，不驗證 CSV 真按頁面篩選、站點所有權或資料真实性。
- 網站彙總、異域／同域其他頁面、不同 query 均不可作為此頁基線；仍可看其輸入統計與不適用原因。必填篩選說明以 textContent 顯示，不執行 HTML。
- 明列覆蓋日數、缺少日期、每日明確零、已提供日期合計。缺日不補零、不把部分資料當完整期間總量；曝光零時 CTR 未知。只有一份暫存觀測，沒有前後比較或歸因。
- 發布證據尚未核實、時間與本版發布後成效未知（不是零）；不提供自行標為核實的表單、JSON 權威匯入或假發布紀錄。
- 檔案／輸入／結果僅頁面記憶體，輸入改變即撤銷舊結果；清除、續編、關閉／重開版本、session／版本切換清空選擇。晚到的檔案／API 回應受 ticket、session 參考、版本可見性守衛，不可重現舊結果。

## 驗證與限制

七組新契約／DOM tests 通過：零／缺日／完整計算；不同頁／query／網站彙總拒絕適用；非法 CSV／日期／來源／自授 verified 拒絕；owner/viewer、最新／歷史與安全文本；錯 org／actor／membership／source／version 拒絕；檔案／API 晚回應在 input／clear／edit／close／session 替換後失效；超量／非法 UTF-8／解析錯誤清空舊結果。與原 measurement/delivery/API/mirror/publish/Review/bound/CSV suites 共 58 項相關契約通過，新測試接入既有 CI。

沿用同一 `url-review.e2e.mjs`：Chromium 1280／390，success 與 preview_closed。每個 viewport 驗未確認版、fresh session 已確認版、Owner 歷史、viewer 歷史及 write-closed 共五次頁面資料檢查：實際 file chooser、有效／無效 CSV、其他頁／網站彙總、零／缺日／完整值、提供者未驗真、關閉重開清除、無 overflow/page errors。觀測／audit／content_versions 前後相同，檢查零額外 POST；success 原合成 Review 1 POST 與 closed 0 POST 預算不變，原 Copy／真 download bytes 斷言保留。全部 backend 為隔離 synthetic transport／SQL，沒有 hosted 寫入。

兩 runtime config SHA256 仍 `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`；persistent frozen index 仍 `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351`。無 schema/store/adapter/OAuth、SQL/Auth 或 flags 變更；無 hosted restore／登入／live Save／Review POST／URL／模型／費用／實際發布。同 HEAD CI／Preview 結果另以交付工具證據核對，Preview build 不冒充 live 互動驗收。

CoreMilestoneProgress=1，maintenance 連續數=0。這是可操作的頁面資料適用性檢查，不是完成 M5。下一独立缺口是兩份同頁／同口徑資料的相容性與期間觀測比較；核實發布及 live 數據仍需相應來源與批准，不能靠本機聲明升格。100cap 與既有 P3 debt 繼續 Deferred；本次不另啟下一 Core。
