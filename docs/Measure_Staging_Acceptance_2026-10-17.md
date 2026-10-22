# Measure 隔離 Staging 真實驗收紀錄（2026-10-17）

## 結論

`STAGING_ACCEPTANCE_PASS`：Measure 已在既有隔離 Supabase Staging 以真實 Auth
工作階段完成保存、讀回與租戶隔離驗收。未使用 Owner 私人帳號，未操作
Production，未變更 Secrets，未合併 PR。

## 環境身分

- 目標專案：`vhzryhibmpvglzcmfnaa`（新加坡區，與 MorningAI 正式專案分屬
  不同組織）。既有驗收紀錄記載此專案僅使用測試 Auth 帳號與合成租戶資料，
  無客戶資料、無正式網域、未承載正式服務。
- 合成租戶：`93a88055-0a0b-40c0-b22f-a6d312320001`（OrgA）與
  `93a88055-0a0b-40c0-b22f-a6d312320002`（OrgB），驗收前已確認兩者存在。
- 執行通道：Supabase CLI 登入工作階段已建立（`supabase projects list` 成功）。
  沙箱無法解析/直連資料庫 Pooler（`supabase link` DNS 失敗），因此改用
  平台官方 HTTPS REST/Auth 通道執行；未停用 Sandbox，未索取或輸出任何
  Token、密碼或金鑰值（金鑰僅在執行程序記憶體內使用）。

## 實際執行（真實 Staging，非離線）

臨時建立三個合成帳號（owner / viewer / foreign，`@example.test`），以真實
密碼登入取得 JWT，插入合成 membership 後驗證，結束後全數刪除（帳號、
membership 與本次保存版本皆已清理）：

| # | 驗收 | 結果 |
|---|------|------|
| 1 | 合成組織存在 | PASS（2/2） |
| 2 | 合成 membership 建立 | PASS（201） |
| 3 | 合成帳號真實登入取得 JWT | PASS |
| 4 | owner 呼叫 `save_search_observation` RPC 保存 | PASS（200，回傳版本 id） |
| 5 | 相同 request_id 冪等重試回傳同一 id | PASS |
| 6 | owner 讀回 payload 與保存內容語義完全一致 | PASS |
| 7 | 同租戶 viewer 可讀 | PASS（1 筆） |
| 8 | viewer 寫入被拒 | PASS（403） |
| 9 | 跨租戶讀取隔離 | PASS（0 筆） |
| 10 | 跨租戶寫入被拒 | PASS（403） |
| 11 | 匿名讀取被拒 | PASS（401） |

保存 payload 為 `growth-os-search-baseline` v2 合成快照（sample=true，
2026-09-01~02，點擊 2/曝光 10 與 0/0），與
`docs/Measure_Staging_Payload_2026-10-17.json` 契約一致。

## 尚未完成（不得以本次結果替代）

- 瀏覽器端登入 Workspace 後的操作驗收（W1 原始登入問題仍為 HUMAN_REQUIRED）。
- Publish 已授權測試站的實際發布與讀回：試點站點授權尚未建立閉環。
- 真實 GSC 授權與正式成效數據：未執行，成效一律標示「追蹤中」。
