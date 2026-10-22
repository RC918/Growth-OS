# Declared-Product Staging 變更決策包（2026-10-20，待 Owner 核准）

## 目的

讓隔離 Staging `vhzryhibmpvglzcmfnaa` 的 DB 端驗證器接受已核准的
`declared_product_dom`，使自訂佈景商品頁能完成 Save／Review。
本包僅供核准，**未執行任何遠端寫入**。

## 精確變更

新 forward migration（不改寫歷史 migration 或 closed-package）：

```sql
create or replace function private.fr_valid_payload(p jsonb)
-- 函數本體與現行部署逐字相同，僅 extraction.method 允許清單新增：
-- ('explicit_product_microdata','woocommerce_single_product','declared_product_dom')
```

候選本體來源：`supabase/drafts/declared_product_validator/candidate.sql`
（與 proposal.sql 函數本體僅差該一行與 CREATE OR REPLACE）。

## 前置守衛（執行前必須全部成立）

1. 唯讀讀回現行 `fr_valid_payload` 定義，SHA 與候選基線一致；
   不一致即停止並回報差異，不覆寫未知版本。
2. 確認呼叫鏈未變：`save_url_result_draft` → `fr_valid_payload`，
   且 content_versions CHECK 同步使用同一函數。
3. 備份現行函數定義全文作為回復依據。
4. Review／Save 其他 RPC 的 ACL 與函數 SHA 不得漂移。

## 停用／回復

- 回復 = 以備份定義再次 `create or replace` 回原兩方法清單；
  不需資料遷移，已保存版本維持唯讀可回。
- 停用 declared-product 保存只需回復函數；First Result 產生與
  標準 WooCommerce／microdata 保存不受影響。

## 權限影響分析

- 不變更任何 GRANT／REVOKE、RLS policy、Auth 設定或 Secrets。
- 函數本身維持既有 ACL（CREATE OR REPLACE 保留）。
- 唯一行為變化：DB 端開始接受 declared-product 來源成果；
  其 SHA、citations、product_scope、事實綁定、租戶檢查全部維持。

## 核准後驗收

1. 連接器執行 migration 並讀回函數 SHA 與 ACL。
2. 合成 owner：Landyachtz 類型 payload Save → Review → 新會話讀回。
3. viewer／跨租戶拒絕、未註冊方法與偽造摘要仍被拒。
4. CI 全綠與 Workflow Reviewer APPROVE 後才視為完成；
   託管真人驗收仍由 Owner 最後確認，不以隔離結果冒充。

## 不核准的影響

自訂佈景商品頁可產生 First Result 與交接，但無法保存至
Workspace；其餘產品路徑不受影響。
