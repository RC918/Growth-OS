# 待審清單與審查通道紀錄（2026-10-19）

基準：接管分支 `takeover/muse-primary-20261016`、Draft PR #31。
最後已審基準 `3c4fdc3` 之後的 11 個 Commit 原列 REVIEW_BLOCKED，
2026-10-19 已由獨立 Reviewer 全數補審完畢（見下表）。未審變更
不得進入正式發布：PR 維持 Draft、不合併，此界線不變。

## 審查通道結論

- 原生子代理通道：子代理日誌終端事件連續 27 次為
  `runtime_turn_task_lost`，發生於 `model_request_configured` 之後、
  子代理產生任何模型回應之前；context 診斷事件均為 benign
  observed。屬執行期系統性故障，非任務內容、路徑或權限問題。
- 替代通道（已驗證可用）：Workflow 執行期子代理與主管使用不同
  會話與排程路徑。兩個獨立子代理分別完成唯讀審核並回傳結構化
  裁決與工具證據，證明此通道可作真正獨立 Reviewer。
- 新政策：Reviewer 一律優先使用 Workflow 獨立子代理；原生子代理
  改為退避，僅在會話重啟或執行期狀態有實質變化時至多探測一次，
  不再每輪 Loop 無變化重試。主管不得自行裁決 APPROVE。

## 待審清單（全數已補審）

| Commit | 類型 | 變更摘要 | 風險 | 測試／CI 證據 | Reviewer 裁決 |
|---|---|---|---|---|---|
| `1c6303f` | 實質（CI）＋文件 | 新增專用 CI 工作流 `handoff-bridge.yml`；Checkpoint 補記 | 中：新增 CI 觸發面；不觸碰衝突檔案 | 本機 5/5 PASS；新工作流 CI 雙次 success | APPROVE（Workflow 獨立子代理，4 次工具呼叫實證） |
| `ebdc437` | 純文件 | Checkpoint：CI 結果與 REVIEW_BLOCKED 紀錄 | 低 | 主工作流 CI success | APPROVE |
| `8ed7594` | 純文件 | Checkpoint：CI 執行中釐清 | 低 | 同上 | APPROVE |
| `aede06f` | 純文件 | Checkpoint：Reviewer 根因與 CI 終態 | 低 | 同上 | APPROVE |
| `6d29c16` | 純文件 | Checkpoint：CI 鏈至 `aede06f` | 低 | 同上 | APPROVE |
| `c24a973` | 純文件 | Checkpoint：CI 鏈至 `6d29c16` | 低 | 同上 | APPROVE |
| `10375fc` | 純文件 | Checkpoint：CI 鏈至 `c24a973` | 低 | 同上 | APPROVE |
| `31b6157` | 純文件 | Checkpoint：CI 鏈至 `10375fc` | 低 | 同上 | APPROVE |
| `02da9fe` | 純文件 | Checkpoint：CI 鏈至 `31b6157` | 低 | 同上 | APPROVE |
| `0ccc486` | 純文件 | Checkpoint：CI 鏈至 `02da9fe` | 低 | 同上 | APPROVE |
| `99b8c48` | 純文件 | Checkpoint：CI 鏈至 `0ccc486` | 低 | CI 於補審時 Python 仍 PENDING（橋接 success） | APPROVE |

相依關係：10 個純文件 Commit 均僅修改
`docs/Autonomous_Manager_Checkpoint_2026-10-18.md`，依序記錄
前一 Commit 的 CI 終態與 Reviewer 狀態，構成單向證據鏈；
`1c6303f` 為唯一實質變更，其 CI 工作流為後續全部 Commit 的
橋接測試證據來源。Reviewer 對 10 個文件 Commit 的核對包含
diff-tree 單一檔案確認與禁用主張掃描，未發現冒充 E2E、
發布或審核通過的文字。

## 自動交接 E2E 於 CI 的需求結論

`supabase/tests/auto_handoff_acceptance.mjs` 現行需求（已讀原碼）：

- Playwright Chromium：CI 已於其他步驟安裝，能力存在。
- 目標 Origin 為 Vercel 分支 Preview，受 Vercel SSO 保護，
  CI 瀏覽器無法匿名通過，需繞過設定或停用保護（Owner 權限）。
- 需 `SUPABASE_SERVICE_KEY`（service_role，高權限、可繞 RLS）
  與 `SUPABASE_ANON_KEY` 指向 Staging `vhzryhibmpvglzcmfnaa`，
  以建立合成帳號、產生 magic link 與清理資料。新增此類 CI
  Secrets 屬 NEED_OWNER，主管不自行擴權。

替代方案（不新增高權限 Secrets，建議優先）：

- 將 E2E 移植至 CI 既有隔離臨時堆疊（原生 GoTrue/PostgREST/PG
  映像已於既有步驟使用）：在本機 Runner 伺服同版衍生建置、
  以合成帳號完成「橋接領取 → 保存 → 新會話讀回」的瀏覽器級
  驗收。此證明橋接與保存邏輯，不冒充託管 Staging 驗收；
  腳本需先將寫死的 REF/ORIGIN 改為環境參數（預設值不變）。
- Owner 核准方案（次選）：於 GitHub 新增 Staging 限定的
  service/anon key Secrets 並處理 Vercel 保護繞過；service key
  權限高，須限定此 Repo 與分支、接受其繞過 RLS 的風險。
