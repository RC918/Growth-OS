# Phase 3B.2 標註回收、分歧裁決與後續比較流程

狀態：`READY_FOR_OWNER_TO_APPOINT_ANNOTATORS`
盲標資料：`prototype/ai-seo/fixtures/claim-holdout-blind-v1.json`
回收模板：`prototype/ai-seo/fixtures/claim-holdout-return-template.csv`
標註說明：`docs/Phase3B2_Holdout_Annotation_Package_2026-10-21.md`

## 盲標保證

- 盲標檔不含工程預標註、Prototype 判定、案例分組或標註理由，只保留題目、語言與來源證據。
- 30 筆順序已交錯打散，分組不會成批出現，也不能由編號順序推測。
- 標註者在回收截止前不得取得 `claim-holdout-v1.json` 的工程標籤或任何 Prototype 輸出。
- Muse、Workflow Reviewer 與原型開發者都參與過原型或其審查，
  不符合「未參與開發且看不到工程標籤」的獨立人工標註資格，不得冒充標註者。

## 回收流程

1. Owner 指派兩位未參與原型開發的標註者與一位裁決者，發給盲標檔與標註說明。
2. 兩位標註者各自獨立填寫回收模板（每人一份 CSV），不互相討論、不看彼此結果。
3. 回收時先檢查：30 列齊全、判定值合法、每列有一句理由、信心與日期已填。
4. 兩份結果由非標註者彙整成差異表；標註者身分以代號記錄，不揭露給裁決者。

## 分歧裁決

1. 兩位標註者一致的題目直接定案。
2. 不一致的題目交裁決者在看不到標註者身分、工程預標註與 Prototype 輸出的情況下裁決，
   並寫明理由；裁決紀錄附加在本文件附錄或獨立裁決檔。
3. 若分歧源自判定定義不足，先把新規則寫成文，再由兩位標註者依新規則重判同類題目。
4. `REVIEW_ADJUDICATION` 題目在規則定案與重判完成前，不計入後續任何對錯統計。

## 定案後的比較流程（標註凍結後才可執行）

1. 定案結果建立新檔保存，與工程預標註並列比對，產出差異表；不得改寫任一方原始紀錄。
2. 只有在定案凍結後，工程才可第一次以保留集執行 Prototype 與 Baseline，
   計算 False Positive、False Negative、Citation Coverage、Review Rate 與 Exact Decision。
3. 比較結果只供 Phase 3B.2 驗收判讀；在比較完成前不得依保留集案例調整驗證器規則。
4. Prototype 接入正式路徑不在本流程授權內，須另案決策。

## 唯一需要 Owner 決策的事項

指派兩位未參與原型開發的獨立標註者與一位裁決者（三人可為產品、內容或一般背景，
不需要工程背景），並決定標註結果的回傳期限。指派完成前，本流程維持等待狀態，
工程端不得以任何模型或開發者代替真人標註。

## 附錄

尚無標註回收與裁決紀錄。
