# Declared-Product Staging 執行包（2026-10-20，交授權連接器執行者）

目標專案：`vhzryhibmpvglzcmfnaa`（Growth-OS 隔離 Staging，禁止 Production）

## 執行順序（任一步驟不符即停止，不放寬）

1. **Preflight（唯讀）**：執行
   `supabase/drafts/declared_product_validator/preflight-staging.sql`，
   保存函數定義全文、MD5、ACL 與 migration history 頭部。
   停止條件：現行定義的方法清單不是恰好
   `explicit_product_microdata`、`woocommerce_single_product`，
   或定義與 `candidate.sql` 基線除該行外有任何差異。
2. **Forward**：以新 forward migration 執行
   `supabase/drafts/declared_product_validator/forward-staging.sql`
   （函數本體僅新增 `declared_product_dom` 一行）。
3. **Postflight（唯讀）**：執行 `postflight-staging.sql`，
   確認 `allows_declared_product = true`、ACL 與 security/search_path
   與 preflight 完全一致、migration history 新增一筆。
4. **合成驗收**（既有測試帳號，不用 Owner 私人帳號）：
   Landyachtz 類型 payload Save → Review → 登出新會話讀回；
   viewer 不可寫、跨租戶不可見；未註冊方法與偽造摘要仍被拒；
   既有 WooCommerce Save／Review 抽測不退化。
5. **證據回傳**：函數前後 MD5、ACL 讀回、migration version、
   驗收結果與任何失敗細節，交 Muse 記錄 Checkpoint 並複審。

## 回復

任一安全驗證失敗：執行 `rollback-staging.sql`
（還原原兩方法函數本體），再跑 postflight 確認
`allows_declared_product = false` 且 ACL 不變；不需資料遷移。

## 邊界

- Muse 本身無合法 SQL 執行通道，不繞過限制；本包交具有正式
  Supabase 連接器的授權執行者操作，Owner 不需手動貼 SQL。
- 最新相關 CI：Handoff 全綠；Python CI 於交包時仍 in_progress
  （非失敗），執行者開工前請確認其終態無安全／契約失敗。
- 本授權僅限此單一函數一行清單；其他函數、RLS、Auth、Secrets、
  Production、PR Merge 均不在範圍。
