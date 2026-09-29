# 內容版本審核｜獨立 Staging

## 交付

- `content_reviews` 為不可覆寫的草稿版本保存 owner 的核准／退回決策、理由與時間；`content_versions` 仍是不可覆寫的草稿正文。
- owner 專用 RPC 核對所屬租戶、機會仍已核准、版本為目前最新版且尚未審核，再新增一筆決策與 audit event。viewer 只能按 RLS 閱讀本工作區紀錄，無直接寫入權限。
- 新草稿版號增加後，舊版核准仍保留作歷史紀錄，新版顯示待審核。內部核准不會產生公開 URL，也不會呼叫發布服務。

## 驗證

- Supabase 獨立 Growth OS Staging migration `content_draft_review`（版本 `20260929150804`）已套用。
- SQL 回滾測試通過：owner 最新版核准、空理由／舊版／重複審核拒絕、稽核一致、viewer 與跨租戶讀寫拒絕。回滾後原有 1 筆草稿仍在，版本審核為 0 筆。
- 本地 Workspace 測試驗證 owner 的 RPC 參數、viewer 前端拒絕、同租戶審核讀取、原型與預覽檔一致。Supabase Security Advisor 無新增安全警告；既有 Auth 密碼外洩保護提示仍存在。

真實瀏覽器 owner 審核畫面與 viewer 唯讀顯示尚待驗收。本階段沒有正式網域、公開發布、真實客戶資料或流量成果。
