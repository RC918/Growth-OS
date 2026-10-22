# Declared-Product DB Validator Exception — Owner 決策包（2026-10-20）

## 發現（第四處相依，依 v3 授權未自行修改）

Frozen Exception v3 只核准兩個 JS payload 驗證器與一筆 deploy hash。
Landyachtz 變體在 CI 原生堆疊實際執行後，於「real save」階段失敗：

- 瀏覽器領取、來源契約與 `declared_product_dom` provenance 均 PASS。
- 點擊保存後 60 秒未出現「已保存第 1 版」，流程逾時中止。
- 根因：資料庫端 `private.fr_valid_payload` 的方法允許清單只有
  `explicit_product_microdata`、`woocommerce_single_product`，
  不含 `declared_product_dom`，Save RPC 因此回 `INVALID_PAYLOAD`。

證據位置：

- `supabase/drafts/first_result_save/proposal.sql:220`（原生測試 schema 來源）
- `supabase/drafts/first_result_save/closed-package.sql:341`（歷史封閉包，禁止改寫重播）
- CI run `39361568273`／`39361564421`：Landyachtz 步驟於 real save 逾時 FAIL，
  其餘前置步驟 PASS；合成變體不受影響。

## 建議的最小變更（需 Owner 新核准）

僅在 `fr_valid_payload` 的方法允許清單新增 `declared_product_dom`：

```sql
p#>>'{extraction,method}' in
  ('explicit_product_microdata','woocommerce_single_product','declared_product_dom')
```

範圍界定：

- 測試 schema 來源：`supabase/drafts/first_result_save/proposal.sql` 一行。
- 隔離 Staging 部署：須以新 forward migration 經正式連接器執行，
  不改寫歷史 closed-package；實際 SQL 與回復函數本體須先讀回備份。
- 不放寬其他驗證：來源 SHA、citations、product_scope、事實綁定、
  租戶與 RLS 檢查全部維持。

## 風險與回復

- 風險：DB 端開始接受 declared-product 來源成果；其證據強度已由
  JS 驗證器、適配器契約與 Review 流程把關，且仍為 source_asserted。
- 回復：移除該清單項或還原函數本體即可，資料不需遷移；
  已保存的 declared-product 版本仍可唯讀回，不受影響。

## 核准後驗收

1. Native CI：Landyachtz 變體 Save → Review → 新會話讀回全 PASS。
2. 合成與 WooCommerce 既有 34/34 與 Python 28 項不退化。
3. Workflow 獨立 Reviewer 審核實際 SQL Diff 與 CI 終態。
4. 隔離 Staging 部署另經連接器執行與讀回，不冒充已部署。

## 目前狀態

- 本決策包提出前，Landyachtz 完整 Save／Review 鏈標記 **BLOCKED（NEED_OWNER）**。
- 不核准的影響：自訂佈景商品頁可產生 First Result 與交接，
  但無法保存至 Workspace；標準 WooCommerce／microdata 路徑不受影響。
