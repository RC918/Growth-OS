# Headless 受控實測｜證據 2026-10-16

## Owner 終端（沙箱外）
- 會話 `01a1446c-3bf5-7183-bb59-4acb654cbb80`，cli log 顯示 mode=exec、trust=trusted；session.jsonl 終端紀錄 completed、exit_reason=clean、歷時約 13.2s。判定：Owner Mac 終端 headless 可用。

## 本沙箱（Controller 所在環境）
- 單次 `muse exec --provider echo`（免認證模式）仍失敗：無法讀取 `~/.config/muse/settings.json`、無法建立 session lock 目錄，皆 Operation not permitted。
- 判定：HEADLESS_BLOCKED（僅限本沙箱）；根因為沙箱檔案權限，非訂閱或認證問題。未重試付費 API、未複製憑證、未改 macOS 安全設定。

## 修復方案（依優先序）
1. 由 Owner 在自有終端（非沙箱）啟動 Muse 會話執行 Controller，headless 已於該環境證實可用。
2. 或由 Owner 以停用沙箱的啟動旗標重開 Muse（啟動時選擇，非改系統安全設定）。
3. 在此之前以已驗證的會話內 Coder/Reviewer 子代理分離替代 headless 派工。

## Watchdog 條件
本沙箱未符合受控 Watchdog 啟用條件；Owner 終端環境符合 headless 前提，仍須 Owner 核准排程邊界後才可啟用。
