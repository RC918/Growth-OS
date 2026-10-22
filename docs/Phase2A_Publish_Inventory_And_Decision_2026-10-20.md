# Phase 2A｜Publish 能力盤點、缺口與第一個真實測試站決策包（2026-10-20）

## P0 Phase 1 封存

Owner 真人驗收（Landyachtz）：First Result、無手動 JSON 自動交接、
Staging Save、登出新會話讀回、Workspace Review 全部 PASS；
內容版本 `25b7a06c-d177-4efc-8474-83dafe2d5239`、
Review `bb06b0d6-ca29-4b20-9e31-5f7839102f06`、未發布。
Staging Migration `20261020040808` 已部署，託管合成驗收 11/11 PASS。

## P1 既有 Publish 能力（重用，不重造）

- 發布器：`prototype/wordpress-publish/publisher.mjs`
  preview → 明確 confirm → POST 寫入 → API/HTML 雙讀回 →
  restore（Rollback）→ 狀態機含 unknown／state_diverged 安全處理。
- 授權契約：只接受 `exact_version_confirmed` 的精確版本綁定
  （organization、version、review、target_url）；版本變更、
  頁面漂移、未核准、跨租戶一律在寫入前拒絕；重複發布被
  consuming 語意阻擋，只能 GET 對帳。
- 資料契約：已審版本欄位 title／meta_description／description
  與發布證據（before/after revision、observed_at）綁定保存於
  journal，可冷重啟回復；`traffic: 'unknown'` 明確標示。
- Measure：`apps/web/publication-measurement.mjs` 的
  assessPublication 區分 baseline／followup／UNKNOWN；
  GSC 契約測試已存在（`prototype/gsc-measurement/`）。
- CI 實測：GitHub Actions 臨時 WordPress＋MariaDB 已有
  excerpt 讀回、受控 publication、publisher/journal 契約測試。

## 本輪新增（最小缺口）

- `prototype/wordpress-publish/url-result-publish.test.mjs`（4/4 PASS）：
  以真實已審 URL 成果版本形狀（Landy 版本/Review ID、組織、
  三欄位）驅動既有發布器，完成 preview→publish→readback→restore；
  未核准、過期版本綁定、跨租戶 token 全部零寫入被拒；
  量測維持 UNKNOWN，不冒充流量。
- 引導原型：`prototype/phase2a-guide/index.html`，單一入口貼網址，
  右側逐步引導、狀態語意（UNKNOWN／NOT_CONNECTED／NO_DATA／
  實際數值）與每步需要使用者決定的事項；不連線、不發布。

## 缺口（誠實標示）

- 發布權威目前由合成 authorize 注入；與 Staging Save/Review
  RPC 的即時綁定尚未接線（需服務端整合，另案）。
- 第一個真實受控測試站尚未選定與部署；託管 Preview 的
  Publish UI 實測未執行（NOT_TESTED）。

## 第一個真實受控測試站發布決策包（待 Owner 核准）

建議最小方案：

1. 選定一個 Owner 自有、可銷毀的 WordPress 測試站（或以
   GitHub Actions 臨時 WordPress 長期化一個 staging 子網域）。
2. 只發布一個已確認版本的合成內容，含 HTTP 讀回與 Rollback 實測。
3. 憑證以測試站專用帳號最小權限提供，不用正式站管理員帳號。

不核准的影響：Publish 維持隔離與契約驗收，無法取得第一筆
真實測試站發布證據。核准後 Muse 可自主完成部署接線、
隔離實測、CI／Reviewer 與回復驗證；正式網站與 Production
仍不在範圍。
