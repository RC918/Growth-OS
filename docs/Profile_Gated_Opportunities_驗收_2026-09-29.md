# 成長機會提案｜企業檔案核准門檻

Growth OS 獨立 Staging migration `profile_gate_private_rpcs`，版本 `20260929020743`。

owner 必須先建立並核准企業成長檔案，才能透過提案 RPC 建立新機會。檔案為 draft、尚不存在或內容修改後失去核准時，新提案均被拒；已建立的提案保留其決策紀錄。提案仍只接受 owner 自述問題／研究筆記，不假裝這些資料等於搜尋量或實測成果。

建立及核准提案的特權實作搬至未暴露的 `private` schema；公開 RPC 是 `SECURITY INVOKER` wrapper，表格仍無客戶端寫入權限。兩個 RPC 均從 `auth.uid()` 核對 owner。Security Advisor 已不再回報這兩個公開函式的 definer 警示；既有 Auth 外洩密碼防護警示仍待正式上線前處理。

Staging `create_growth_opportunity_staging.sql` 使用合成身分和回滾交易，驗證無檔案、draft、已核准、編輯後回 draft、viewer／跨組織、未驗證站點與來源種類限制，以及建立至核准與稽核鏈，PASS。`review_growth_opportunity_staging.sql` 驗證 viewer／跨組織、缺少來源、無效及重複決策、owner 核准與稽核同交易一致，PASS；其 actor 斷言已限縮在本次測試組織，以免混入既存的隔離 fixture。`business_profile_staging.sql` 重新驗證 PASS。這些不是實際密碼登入或 Web 端到端驗收。
