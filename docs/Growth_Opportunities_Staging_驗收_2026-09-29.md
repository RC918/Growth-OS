# Growth Opportunities｜Staging 資料契約與驗收

2026-09-29 台灣時間。獨立 Growth OS Supabase 專案 `vhzryhibmpvglzcmfnaa`；migration `growth_opportunities_v1`，資料庫版本 `20260928160322`。沒有接入 Morning Ai、真實客戶網站或付費設定。

## 資料邊界

| 表 | 用途 | 關鍵限制 |
|---|---|---|
| `business_profiles` | 一組織一份產品／受眾／市場／主要成果檔案 | draft 或 owner_approved；批准者與時間同時存在 |
| `growth_opportunities` | 需求、行動、理由、渠道、信心與待審狀態 | 分數可空；不把未知搜尋量當 0 或成效 |
| `opportunity_sources` | 機會的來源種類、可追查證據與觀察時間 | 複合外鍵拒絕跨租戶關聯；不得存個資原文 |
| `opportunity_decisions` | 核准／拒絕者、理由與時間 | 服務端未來必須核對 actor 身分及 owner 權限 |

四表均有 RLS；authenticated 成員只可讀自己的組織，anon 無表權限，客戶端沒有 INSERT／UPDATE／DELETE。服務端交易尚未建成，不能把資料表存在誤當核准工作流已完成。`source_url` 是資料來源紀錄，任何未來抓取器仍須另做 SSRF 防護。

## 實際 Staging 驗收

1. 在交易中執行 DDL 乾跑並回滾；確認四表可建立且事後為 0，之後套用 migration。
2. `tests/growth_opportunities_staging.sql` 建立兩個虛構 Auth 身分、兩個組織與各一列四表資料，模擬 authenticated JWT。A owner、B viewer 各只看見自己的四列；非成員和移除 membership 後均看見 0。
3. 直接 INSERT／UPDATE／DELETE 被拒；將 A 的 source 指向 B 的 opportunity 遭複合外鍵拒絕。測試全程回滾；四表與兩個臨時 Auth 身分事後均為 0。結果 PASS。
4. Supabase Security Advisor 未回報新表 RLS 問題。Performance Advisor 回報部分尚未索引的外鍵與尚未使用的索引（空表）；待真實查詢路徑與資料量再檢視。Auth 的外洩密碼防護停用警示另列正式登入門檻。

## 下一道門檻

實作可信服務端：驗證 session、組織／站點權限、來源內容限制，原子更新機會狀態與決策紀錄，拒絕 viewer 核准，並保存稽核事件。再用真實 Auth session、Data API 與 Web 介面驗收新增四表；補 GSC／GA4 授權及真實流量基線前不可宣稱流量成長。
