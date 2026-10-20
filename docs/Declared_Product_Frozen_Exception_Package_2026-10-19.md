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

## 執行紀錄與修訂（v2）

Owner 一次性核准後已套用（Commit `ca945df`），
與本包 Diff 逐字一致：修改前雜湊
`3c3ee22192c3ae11b51f5ebf86afef0b46a8d4db514f295500a5387352d9750b`、
修改後雜湊
`bc17a364a5496ad14ea252199d0fbc60c5ed202bcca8becc96687a915d09ca1c`，
其餘 114 檔零漂移；隔離契約測試通過（領取
驗證、Save、讀回、Review 確認與讀回，合成
傳輸），Workflow Reviewer 曾裁決 APPROVE。

惟 CI（Run `39283245114`）於「Workspace API
contract checks」失敗：測試
`preview publishes the exact reviewed workspace files`
逐檔比對 `prototype/owner-workspace/` 已審鏡像
與 `apps/web/` 是否逐字相同；僅改一側觸發
此釘選守衛（其餘步驟均通過，非行為退化）。

依核准函第 5 點，已以 Commit `38245bc` 回復
`ca945df` 全數變更：payload 回復原雜湊、
frozen 115 檔零漂移、本機 Workspace API
測試 14/14 通過、CI 回復全綠路徑。

修訂後精確範圍（共兩檔、同一行、內容一致）：

1. `apps/web/first-result-payload.mjs`（frozen，
   前 `3c3ee221…` → 後 `bc17a364…`）。
2. `prototype/owner-workspace/first-result-payload.mjs`
   （已審鏡像，不在 frozen 清單；修改前與
   第 1 檔逐字相同，同步同一行後同為
   `bc17a364…`，鏡像不變式維持）。

其餘條款與 v1 相同。**待 Owner 核准此修訂
範圍後重新套用**；未核准前維持回復狀態。
託管 Preview 實測維持 NOT_TESTED／ENV_BLOCKED。

## 修訂（v3）：部署清單雜湊同步（最終範圍）

v2 套用後 CI（Run `39290711011`／`39290700758`）
於「URL exact-version Review contracts」失敗：
`prototype/internal-rc/contract.test.mjs` 的
「frozen RC candidate bytes match the reviewable
deployment manifest」逐筆比對 `deploy/hashes.json`
全部條目，`apps/web/first-result-payload.mjs`
雜湊仍為舊值。此為第二處設計釘選，非行為
退化；已依指示以 Commit `2bb0dd7` 回復 v2
全數變更（兩檔回原雜湊、frozen 零漂移、
本機契約測試僅餘沙箱 EPERM 環境失敗）。

經全面盤點，此檔案的釘選點共三處（另一
`delivery/growth-console/SHA256.json` 由其
build 於 CI 自動重算，非釘選，不需變更）：

1. `apps/web/first-result-payload.mjs` 同一行
   （frozen；`3c3ee221…` → `bc17a364…`）。
2. `prototype/owner-workspace/first-result-payload.mjs`
   同一行（已審鏡像；同步後逐字一致）。
3. `prototype/internal-rc/deploy/hashes.json`
   僅更新第 1 檔的單筆雜湊記錄
   （`3c3ee221…` → `bc17a364…`），其餘 114
   筆不動；此清單由 contract test 逐筆強制。

**待 Owner 核准 v3 三處範圍後重新套用**；
未核准前維持回復狀態（CI 全綠路徑、
適配器維持隔離能力、託管 NOT_TESTED）。

## v3 執行紀錄（Owner 核准三處範圍後）

- 先於隔離 worktree 套用完整候選，再以
  cherry-pick 進入接管分支（候選
  `27ff3da` → 接管 `fe50915`），Diff 與核准
  範圍逐字一致：兩份 payload 同一行、
  `hashes.json` 僅第 9 行單筆更新。
- 雜湊證據：兩份 payload 修改前同為
  `3c3ee221…`、修改後同為 `bc17a364…`，
  `cmp` 逐位元組一致；部署清單 115 筆
  全數比對相符（更新後），其餘 114 檔
  零漂移。
- 本機前置驗證：凍結清單契約測試通過；
  Workspace 鏡像＋Declared-Product 契約
  測試 15/15；Python 相關 36 案通過。
  隔離 worktree 因無 node_modules 無法載入
  RC 契約測試檔，已於主 worktree 補跑
  通過，此限制如實記錄。
- 託管 Preview 實測維持 NOT_TESTED／
  ENV_BLOCKED，未冒充 PASS。
