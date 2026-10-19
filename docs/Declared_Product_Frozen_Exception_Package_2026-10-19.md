# Declared-Product Rescue：Frozen Exception 決策包（2026-10-19）

## 狀態

適配器已完成隔離開發與驗證（Commit 待本包同批提交）。
本包僅提案，**未修改任何 frozen 檔案**；是否核准由
Owner 另行裁決。未核准前，適配器成果可在 First Result
產生預覽，但 Workspace 保存面板會以
`INVALID_EVIDENCE_SCHEMA` 拒絕領取，不會進入 Save RPC。

## 隔離驗證證據

- 適配器：`prototype/public-audit/declared_product.py`
  （非凍結新模組），經 `first_result_api` 單一入口於
  Service 辨識後、引導前執行；只在凍結擷取器已判定
  不支援的快照上運作，不重抓、不改快照 SHA。
- 真實 Landyachtz Fixture（錄製 HTML，SHA-256
  `c98f512d…ab57`）：產生完整商品成果——名稱
  「The Clark」、描述為頁首後第一段連續段落群集、
  5 筆來源引用、預覽與來源版本綁定一致。
- 負例全數 fail-closed：多商品混淆、描述衝突、
  缺少商品專屬描述。`test_first_result_api` 28 案
  與 `test_service_source` 合計 36 案全過。
- 契約落差定位：以未修改的 JS 驗證器
  （`apps/web/first-result-payload.mjs`）驗證適配器
  成果的 Review 匯出，唯一失敗為
  `INVALID_EVIDENCE_SCHEMA`；將 method 於記憶體內
  暫換為既有枚舉值後，完整驗證通過。證明快照、
  SHA、citations、事實、商品範圍、摘要與預覽
  綁定全部符合現行契約，唯一落差是擷取方法枚舉。
- frozen 115 檔雜湊驗證：零漂移。

## 提議修改（精確 Diff，一行）

檔案：`apps/web/first-result-payload.mjs`（第 85 行）

```diff
-    ['explicit_product_microdata', 'woocommerce_single_product'].includes(r.extraction.method) &&
+    ['explicit_product_microdata', 'woocommerce_single_product', 'declared_product_dom'].includes(r.extraction.method) &&
```

此行為 `INVALID_EVIDENCE_SCHEMA` 複合條件的一部分；
其他條件（page_type、limitations、generation）不變。

## 影響範圍

- 受影響：Workspace 保存面板對
  `declared_product_dom` 成果的領取驗證；通過後沿用
  既有 Save RPC、Review 摘要與 DB 形狀檢查（伺服端
  不檢查擷取方法，payload 摘要綁定不受影響）。
- 不受影響：凍結擷取器、robots/SSRF 規則、Auth/RLS、
  Save/Review RPC 本體、既有兩種方法的成果。
- 衍生建置：Preview 建置自 `apps/web` 衍生，部署後
  自動包含此行；無需 DB migration 或 Secrets 變更。

## 風險與控制

- 風險：新證據類別的誤綁定。控制：適配器規則為
  宣告身分一致＋單一頁首身分＋價格/購物車佐證＋
  頁首後唯一連續描述群集；衝突即拒絕，並有真實
  Fixture 與三類負例鎖定行為。
- 風險：例外範圍擴散。控制：僅新增一個枚舉值，
  不放寬任何事實、引用或摘要條件；Reviewer 可由
  `extraction.method` 辨識此類成果並加強審查。

## 回復方式

還原上述一行並重新部署 Preview 即回復；適配器
成果將回到保存面板拒絕狀態（First Result 仍可
預覽，與未核准狀態相同），已保存資料不受影響
（未核准前不會有此類資料進入 Staging）。

## 待 Owner 裁決

核准後：套用一行修改 → CI → Workflow 獨立
Reviewer → Preview 部署 → 以 Landyachtz 完成
First Result → Save → Review 隔離驗收。
不核准：適配器保留為隔離能力，L1 fail-closed
現況維持，後續 Loop 不再重提相同提案。

## 執行紀錄（Owner 一次性核准後）

- 核准範圍與本包 Diff 逐字一致，已套用於
  接管分支；未修改其他 frozen 檔案，未放寬
  source_asserted、citations、product_scope
  或 SHA 驗證，未變更 RPC、RLS、Secrets。
- 修改前 SHA-256：
  `3c3ee22192c3ae11b51f5ebf86afef0b46a8d4db514f295500a5387352d9750b`
  （與 frozen 清單記錄一致）。
- 修改後 SHA-256：
  `bc17a364a5496ad14ea252199d0fbc60c5ed202bcca8becc96687a915d09ca1c`。
- 其餘 frozen 檔案：115 檔中僅此 1 檔漂移，
  其餘 114 檔零漂移（逐檔驗證）。
- 隔離契約驗證：適配器成果經真實 Review 匯出
  後通過更新後驗證器；並以真實 Workspace API
  完成領取驗證、Save、讀回核對、Review 確認與
  Review 讀回（`supabase/tests/declared_product_contract.test.mjs`，
  合成傳輸；託管持久化不在此宣稱）。
- 託管 Preview 實測：未執行，維持 NOT_TESTED／
  ENV_BLOCKED，不得冒充 PASS。
