# Phase 2A｜Search Console 接入方案（設計，未連線）

## 原則

- 未經 Owner 核准，不連接任何真實 Search Console 帳號、
  不要求高權限 Secrets、不修改任何正式站點驗證設定。
- 在連線前，Measure 一律呈現 NOT_CONNECTED；連線後無資料
  是 NO_DATA；有資料才顯示實際數值。三者不互相冒充。

## 建議接入方式（待 Owner 決策）

1. **授權模式**：Owner 以自有 Google 帳號對單一測試站
   property 授權唯讀（Search Console API read-only scope），
   不用全帳號或正式站管理權限。
2. **資料契約**：沿用既有 `prototype/gsc-measurement/`
   契約與 `apps/web/publication-measurement.mjs` 的
   assessPublication：以發布版本的公開 URL 為鍵，
   讀取有日期範圍的曝光／點擊，保存來源與讀回時間。
3. **儲存**：沿用既有 Workspace 保存與量測紀錄，不新增
   第二套量測資料庫；觀測與 GSC 數據分欄標示來源。
4. **安全**：憑證只存平台 Secrets（需 Owner 另核准），
   程式碼與 CI 不接觸真實憑證；合成測試以契約替身驗證。

## 核准後最小驗收

- 測試站 property 唯讀連線成功，狀態由 NOT_CONNECTED
  轉為可讀；無資料時正確顯示 NO_DATA。
- 一個已發布版本的 URL 取得有時間戳的實際觀測紀錄。
- 跨租戶與未授權 property 一律拒絕讀取。

## 不核准的影響

Measure 維持 HTTP 可用性觀測（MEASURED／NO_DATA／
NOT_CONNECTED／UNKNOWN），流量維持 UNKNOWN；
產品閉環其餘階段不受影響。
