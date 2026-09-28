# Growth Opportunity 人工核准｜Staging 驗收

獨立 Growth OS Supabase 專案 `vhzryhibmpvglzcmfnaa`，migration `review_growth_opportunity`，資料庫版本 `20260928161802`。沒有改動 Morning Ai、正式網域或付費設定。

## 交易契約

`public.review_growth_opportunity(organization_id, opportunity_id, decision, reason)` 僅授權 authenticated 呼叫。受信任的資料庫函式用 `auth.uid()` 判定操作者，必須是該組織 owner；不接受呼叫端填寫 actor。決策僅能為 approved／rejected，理由為 1–1000 字元。目標提案須屬該組織、尚未審核且至少有一筆來源。鎖定提案列後，同一交易更新狀態、建立決策與 owner 可讀的 audit event。第二次核准被拒。**核准不等於發布、廣告投放或站點變更。**

## 實測結果

在 Staging 使用 `supabase/tests/review_growth_opportunity_staging.sql` 的合成 Auth 身分與模擬 JWT claims，驗證 owner 核准／拒絕各一筆；viewer、B 組織 owner、沒有來源、無效決策、空理由、重複決策皆拒絕。狀態、兩筆決策、兩筆稽核事件和 actor 一致，結果 PASS。整個測試 rollback；後查 decision、review audit、合成 Auth 身分均為 0。CI 靜態檢查函式的授權與必要交易步驟。

Security Advisor 對公開 API schema 中 authenticated 可呼叫的 `SECURITY DEFINER` 函式給出[警示](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)。這個授權是本交易的刻意設計，因為客戶端沒有表寫權；函式內逐次驗證 `auth.uid()` 與 owner membership。上線前仍要用真實 session 及權限撤銷情境再次驗證此安全邊界。既有 Auth 外洩密碼防護停用警示亦尚未處理。

## 尚未完成的驗收

需用真實 Auth session 呼叫 RPC，檢查撤銷 membership 後立即拒絕，並建立可信的提案建立入口及 Web 人工審查畫面。來源真偽、實際流量變化與發佈後效益都沒有由此交易證明。不得在未經資料授權的情況下匯入客戶資料。
