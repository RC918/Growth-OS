# Business Profile｜Staging 驗收

Migration `business_profile_review`，版本 `20260929015843`，僅套用在獨立 Growth OS Staging。

owner 可透過 `save_business_profile` 寫入產品、受眾、目標市場與主要成果。選擇站點時，站點必須屬於該組織且已驗證。新資料先為 draft；`approve_business_profile` 用目前登入的 owner 身分核准並留下時間、身分及稽核事件。修改任何內容會重新變成 draft；重送完全相同的內容不會撤銷核准，也不新增稽核事件。viewer、跨組織成員無法寫入或核准。此資料是 owner 自述，不是市場需求或流量成效的證明。

公開 RPC 使用 `SECURITY INVOKER`，特權寫入函式位於未暴露的 `private` schema，逐次以 `auth.uid()` 核對 owner。客戶端對資料表仍只有讀取權限。Staging 回滾測試涵蓋 owner／viewer／跨組織、已驗證與未驗證站點、無效輸入、重複核准、編輯後失效與稽核一致性，結果 PASS；合成 Auth 身分測後為 0。Security Advisor 未對新增函式回報公開 definer 警示；先前兩個提案 RPC 的同類警示仍存在。

尚需真實 Auth session 和 Data API RPC／Web 端到端驗收、輸入個資防護、站點所有權驗證流程。沒有接入真實客戶資料、Morning Ai 或正式網域。
