# First Useful Result 事實一致性驗收（2026-10-17）

## 對象

成功測試網址：`https://woo.novamodule.com/product/happy-ninja/`
（真實公開 WooCommerce 示範商店；robots.txt 200，僅禁止後台/購物車路徑）
驗證方式：以兩次獨立下載的真實頁面位元組（SHA 不同，動態欄位差異）經正式
`first_result_api.build_snapshot` 路徑重跑，擷取結果一致。

## 來源欄位與擷取欄位逐項對照

| 項目 | 網站來源（原文） | 擷取結果 | 判定 |
|------|------------------|----------|------|
| 最終 URL | canonical `https://woo.novamodule.com/product/happy-ninja/` | final_url 相同 | 一致 |
| 商品 H1 | `BIC00001` | product_name `BIC00001`（引用 s2） | 一致 |
| 頁面 title | `BIC00001 – woocommerce Demo` | fact title 相同（s3） | 一致 |
| JSON-LD Product | 本頁無 JSON-LD Product | 辨識依據為 WooCommerce 容器，非 JSON-LD | 不適用，未冒用 |
| 商品容器 | `div.product type-product post-37`（s1） | 全部事實引用皆在此容器內 | 同一商品 |
| 簡介（summary） | short-description `Downhill Bike – Sunday Team`（s4） | description fact 相同 | 一致 |
| 描述分頁 | tab-description `Downhill Bike – Sunday Team`（s5） | 與 summary 完全相同 | 一致，無衝突 |
| meta description 標籤 | 本頁無此標籤 | fact 缺失並列入 missing（未捏造） | 正確揭露 |
| Preview title 建議 | 來源 H1 `BIC00001` | suggested `BIC00001`（original 為完整 title） | 同源 |
| Preview meta 建議 | 來源無 meta 標籤 | suggested 由 description 衍生、original 為空 | 明示為建議，非擷取 |
| Preview description 建議 | `Downhill Bike – Sunday Team` | suggested `BIC00001. Downhill Bike – Sunday Team`（名稱+原文組合） | 同源組合 |

## 判定

- 無跨區塊或跨商品誤配：名稱取自該商品自身 H1，描述取自同一容器
  （post-37）的 summary 與描述分頁，兩處文字完全相同；相關商品區塊依
  WooCommerce 排除規則未被採用。
- `BIC00001` 與 `Downhill Bike – Sunday Team` 的表面差異是網站自有資料：
  該示範店將商品以代碼命名（同店 BIC00003、ACC00010 等同型），H1、title、
  評論（"2 reviews for BIC00001"）皆以 BIC00001 指稱同一商品。因此不臆測
  「正確」商品名，維持來源原值，並由 Preview 的 pending_confirmation
  標記待使用者確認，符合「來源斷言、非獨立驗證」揭露。
- 最終 Preview 可信任範圍：每一建議欄位皆可回溯至同一商品的來源引用；
  可信任的是「忠實反映來源」，商品命名本身的商業正確性待確認。

## 邊界

本驗收證明真實公開單一產品頁可取得可回溯的第一份成果。現代零售頁
（Shopify、Apple 等）因描述無法無歧義歸屬僅給下一步指引，屬刻意防誤植，
非本缺陷。瀏覽器真實登入 Workspace 驗收仍為 HUMAN_REQUIRED。
