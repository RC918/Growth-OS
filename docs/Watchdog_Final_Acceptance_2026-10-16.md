# Watchdog 原生恢復最終驗收 2026-10-16

## 真實證據（watchdog-native-001）
- 第一次（Owner 原生終端）：REVIEW_BLOCKED，14260ms 模型執行（headless checkpoint：synthetic false、exitCode 0、輸出恰為 HEADLESS_OK）。
- 獨立 Reviewer（異會話、唯讀）寫入綁定 commit `controlled-trial` 的 APPROVE 裁決檔，非 Primary 偽造。
- 第二次（--verdict 恢復）：3ms 完成，REVIEW 與 VERIFY 依序 PASS，最終 REVIEW_PASS。
- CODE 執行次數仍為 1（attempts=1、headless 單筆紀錄）；兩次使用相同任務與 Commit；審計紀錄完整保留兩輪起訖。

## Lock 競態根因與修復
- 產品缺陷：心跳以 FileHandle 當前偏移讀檔（寫入後偏移在檔尾）致續租偶發失效，已改位置 0 定點讀取。
- 測試缺陷：競態測試於截斷瞬間讀檔得空內容，已改重試讀取。修後連續多輪全綠（16 項）。

## 啟用結論
工程條件齊備；正式啟用 10 分鐘受控 Watchdog 仍待 Owner 最終核准與最新 HEAD CI 全綠。未啟用常駐排程。
