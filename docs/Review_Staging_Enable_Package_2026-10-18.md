# Staging Review 最小啟用包（精確版，待連接器執行）

基準：離線候選 Commit `988a0aa`（`supabase/drafts/url_review/persistent/`，hashes 已逐檔核對無不符）。對帳來源：Owner 回報 ChatGPT 連接器於隔離 Staging `vhzryhibmpvglzcmfnaa` 的唯讀實測（2026-10-18）：history 28 筆（含 authority revoke／install／enable／disable 與 Phase 1 general Save restore）、Review 兩函數與 Save 一般版 SHA 全符合、五欄位與兩 constraints validated、六函數 EXECUTE 矩陣符合（URL Save pair 僅 authenticated；First Result pair 與 Review pair 閉鎖）、authority 兩表無直接寫入、五表 RLS 啟用。Muse 未自行執行 SQL；下列每一步仍由工件內守衛在交易內 fail-closed 複核，任一不一致自動中止且不部分套用。

## Part A：資料庫最小啟用（連接器執行，一次一項）

前置（唯讀）：執行候選 `state.sql` 與 `preservation.sql` 存檔備查（不回傳憑證）。

1. 執行候選 `enable.sql`（單一 DO 交易）。其守衛將再次核對：一般版 Save ACL 基準（URL pair authenticated 開放、其餘閉鎖）與本體 SHA `39663723…e1f6b`、authority 兩表寫入閉鎖、無直接表寫入、RLS／角色狀態、Review exact schema／函數本體、Review 啟用前閉鎖；通過後僅 `grant execute` 兩支 Review 函數予 authenticated，並於同一交易驗證生效後 ACL（anon/service_role/PUBLIC 不得有效）。
2. 執行候選 `postflight-enabled.sql`（唯讀斷言），預期成功；再以 `preservation.sql` 比對，業務資料零增量（僅 ACL 與後續步驟的 history 紀錄可變）。
3. 記錄 tracked history：新增一筆 `url_review_persistent_enable`（version 取執行當下新時間戳，statements 為本次 `enable.sql` 原文），使 history 28→29 可稽核。此為記錄步驟，不改任何函數或資料。

回復（任一步失敗或驗收不通過時）：執行候選 `disable.sql`（revoke 全部 Review EXECUTE 並複核閉鎖與 Save 基準），Preview config 維持未啟用；已保存的 Review 列與 audit 不刪除。回復程序已於 PGlite 與真實 PG17 CI 驗證。

## Part B：Preview config（精確缺口，本次不執行）

現行 served config（frozen）為 `urlReviewEnabled=false`；衍生 Preview 建置目前僅翻轉 `urlSaveEnabled`。啟用 Review UI 需在衍生建置額外翻轉 `urlReviewEnabled=true`（不改 frozen 原檔）。該建置檔目前有另一執行者的未提交修改，為避免衝突，本包不動它；Part A 完成後 RPC 即對 authenticated owner 可用，UI 呈現待此一行衍生建置變更落地後再驗收。此缺口不影響 Part A 的安全性（UI gate 關閉時前端不會呼叫）。

## Part C：啟用後合成驗收（Part A 後執行）

以隔離合成 owner/viewer/foreign 帳號經正常 Auth 流程驗證：owner 保存（一般版 Save，既有）→ Review 確認 → 新會話讀回同一版本 → viewer 只讀不可 Review → 跨租戶不可見；其後以 `disable.sql` 停用驗證 Review 被拒，再以 `enable.sql` 恢復並重驗一次。驗收後清理合成資料。Phase 1 真人瀏覽器最終驗收仍由 Owner 執行，不以本合成驗收替代。

## 邊界

僅限隔離 Staging `vhzryhibmpvglzcmfnaa`；不含 Production、Secrets、Billing、Force Push、PR Merge、真實網站或 GSC。任一守衛或對帳不一致：立即停止、保留現況、回報差異，不放寬檢查。
