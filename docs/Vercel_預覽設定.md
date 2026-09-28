# Vercel 預覽設定

- 專案：`growth-os-preview`（獨立於既有網站）
- 倉庫：`RC918/Growth-OS`
- 預覽分支：`feat/web-preview`
- Framework Preset：Other
- 根目錄：倉庫根目錄，使用 `vercel.json` 的 `outputDirectory: apps/web`
- Ignored Build Step：Only build pre-production，以避免此試點建立正式部署
- 預覽頁僅呈現公開的產品說明與無資料流程，不包含表單提交、客戶資料或 Supabase 金鑰
- 暫不綁定正式網域、啟用付費功能或變更既有 `morningai` 與 `owner-console` 專案

本檔同時記錄新專案的部署邊界；正式推出前需另行審查品牌、網域、資料收集與分析設定。
