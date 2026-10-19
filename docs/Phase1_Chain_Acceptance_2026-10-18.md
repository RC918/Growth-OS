# Phase 1 資料鏈驗收（2026-10-18，隔離 Staging 實測）

## 結論

`CHAIN_ACCEPTANCE_PASS`：同一筆 First Useful Result 成果已在隔離 Staging
完成「成果 → Review 確認綁定 → Workspace 保存 → 新會話讀回 → 權限隔離」
全鏈實測。未操作 Production，未再更動資料庫函式或權限。

## 前置事實（本輪確認）

- `save_url_result_draft` 與 private impl 的 authenticated EXECUTE 皆為 true
  （先前由連接器完成，本輪未重複 GRANT）。
- 函數實作已換為一般 owner 版：先前 bound 試驗版固定 actor/request 且
  cutoff 已過，實測錯誤由 `permission denied` 進展為 `Bound owner required`
  後定位並更換；本輪未再修改資料庫。
- 保存 payload 必須含 Review 確認綁定：未含 review 時回 400
  `INVALID_REVIEW_BINDING`，這與真實流程一致（先於 First Result 頁確認
  三欄與事實勾選，再交接保存）。驗收 payload 以 repo 自有
  `first-result-review.mjs` 產生（revision 0、confirmation 存在）。

## 實測結果（合成帳號，真實 Auth/RLS）

測試成果：真實公開商品頁 `https://woo.novamodule.com/product/happy-ninja/`
的第一份成果（product_name BIC00001，含完整 snapshot 與來源引用）。

| # | 項目 | 結果 |
|---|------|------|
| 1 | 合成 owner/viewer/foreign 真實登入 | PASS |
| 2 | Owner 保存至 Workspace 草稿（RPC 200，回傳版本 id） | PASS |
| 3 | 同一 request 冪等重試回傳同一版本 | PASS |
| 4 | 新登入會話讀回：version 1、status draft、title 一致 | PASS |
| 5 | 來源識別一致：snapshot id 與原始 URL 與保存 payload 相同 | PASS |
| 6 | 同租戶 viewer 可讀（1 筆） | PASS |
| 7 | viewer 保存被拒（403） | PASS |
| 8 | 跨租戶讀取隔離（0 筆） | PASS |
| 9 | 跨租戶保存被拒（403） | PASS |
| 10 | 合成草稿/機會/membership/帳號清理 | PASS |

## 邊界

- Review 的「核准發布」與 Publish 實測證據由既有紀錄構成（CI 真實
  WordPress 發布/讀回、Workspace 瀏覽器讀取驗收），Measure 由 Staging
  RPC 保存/讀回驗收構成；本輪證明的是同一來源成果進入 Workspace 並
  可讀回的保存段，未把各段獨立證據冒充瀏覽器端到端。
- 瀏覽器端由 Owner 自行完成最後產品體驗（First Result → 登入 Workspace
  保存 → Review），不需再建合成資料。
- 真實 GSC 成效未連接，標示「追蹤中」。

## Owner 真人驗收紀錄（2026-10-19，正式納入）

來源網址：`https://woo.novamodule.com/product/happy-ninja/`；保存版本 ID `c24902d6-b334-4e8a-99ca-d1b71a1afe21`（Title BIC00001、Meta description `Downhill Bike – Sunday Team`、商品描述一致）。

| # | 真人驗收項目 | 結果 |
|---|---|---|
| 1 | First Useful Result 成功產生成果 | PASS |
| 2 | 來源主要事實完成核對 | PASS |
| 3 | 完整 JSON 成功匯入 Workspace | PASS |
| 4 | 成功保存為 Staging 待審草稿 | PASS |
| 5 | 重新登入後讀回同一版本 ID | PASS |
| 6 | Title／Meta／描述與保存前一致 | PASS |

邊界：此紀錄不代表 Review RPC 已核准、自動交接已通過或內容已發布；自動交接與 Review 啟用依後續段落接續，不重測本表項目。

## Owner 真人 Review 持久化驗收（2026-10-19，PASS）

版本 `c24902d6-b334-4e8a-99ca-d1b71a1afe21`（BIC00001 第 1 版）；Review 確認 ID `3bf683f1-b56a-4b7b-9c2e-3de6fdf1a45a`。Owner 實證：Save → Review → Refresh → Magic Link 重新登入 → 同一版本與 Review 確認紀錄讀回，狀態已確認、未發布。標記真人產品驗收 PASS，不重測；不代表已發布或自動交接已通過。
