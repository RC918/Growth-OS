# Growth Opportunity 自述提案建立｜Staging 驗收

獨立 Growth OS Staging migration `create_growth_opportunity`，版本 `20260928162623`。

`public.create_growth_opportunity` 從登入身分確認組織 owner，接收渠道、受眾問題、建議行動、理由與一則 owner 自述依據。來源種類僅限 `owner_question` 或 `research_note`；不能由此入口冒稱 GSC 查詢、產品資料或量測結果。信心固定 low，分數保持未知。提供站點時，站點必須屬同組織且已驗證。建立提案、來源與稽核事件為同一筆交易，不對外發布。

Staging 合成身分與模擬 JWT 驗收：owner 建立兩個待審提案，另建立一個並用既有 review RPC 核准；viewer、跨組織 owner、未驗證／跨組織站點、冒稱 GSC、空依據均被拒。提案、來源、決策、稽核數量與 actor 一致，結果 PASS；整個交易回滾。後查提案、來源、決策和合成 Auth 身分均為 0。

此入口只保存 owner 自述，不能證明需求量或流量成長。尚需真實 Auth/Data API 與 Web 端到端驗收、入口頻率限制、個資輸入防護、工作區／站點驗證流程。Security Advisor 對刻意授權 authenticated 的 `SECURITY DEFINER` RPC [提出警示](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)；正式對外開放前須重新驗證此權限邊界。沒有改動 Morning Ai、正式網域或付費設定。
