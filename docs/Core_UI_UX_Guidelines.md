# 核心 UI／UX 規範

本文件補充既有 [Commerce Growth 系統設計](Commerce_Growth_系統設計_v0.1.md) 的核心互動規範；不是另一產品藍圖。唯一主線、Auth／tenant／發布授權與 unknown 核對界線沿用 AGENTS 和 v2.0。

- 保留繁體中文、現有 workspace 綠色／淺底視覺、原生 HTML/CSS/ES modules。無新框架、runtime 套件、字型載入或動效依賴。
- 核心欄位有可見 label、近端說明及具體錯誤，透過 aria-describedby／aria-invalid 連結；三欄沿既有 1–2000 UTF-16 單位與非全空白規則，不在 UI 放寬資料驗證。
- 讀取／確認／保存期間顯示動作文字、disabled 與 aria-busy；結果文字位於 role=status 近端區域。busy 放在動作按鈕，不把整個狀態播報區設為 busy。成功必須以既有 exact readback 為準。
- 清楚區分「本頁未保存」、「已保存待確認」、「此確切版已確認」與「未發布」；頁面 receipt 不等於權威版 Review，也不等於發布授權。
- 失敗保留輸入和已保存版本。只有原流程允許的讀取可由使用者重試；unknown mutation 僅核原 request／已知 UUID，不自動重送或換新 request。取消等待不宣稱回滾。
- 主要操作／勾選標籤至少44px高、保留可見鍵盤焦點，錯誤不只靠顏色。390px無橫向溢出、控制項可換行、編輯字級16px；原始證據可折疊查看。desktop1280／mobile390及鍵盤依核心流程實測，不宣稱完成所有WCAG準則。

[UI UX Pro Max](../.agents/skills/ui-ux-pro-max/SKILL.md) 僅以 explicit file loading 提供建議。既有治理與 Owner 授權優先；不執行第三方 installer／catalog refresh，不產生競爭 design-system。新 UI 工作先讀此文件，再以必要的一個 UX concern 查詢本機資料，核對結果適用性後使用。
