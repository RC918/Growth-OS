# Growth OS｜系統設計 v0.2

更新：2026-10-02（台北）。產品方向及 M0–M6 唯一依據為 [執行藍圖 v2.0](AI_Company_Growth_OS_執行藍圖_v1.md)。[原技術設計完整歷史](Commerce_Growth_系統設計_歷史_2026-10-02.md)保留；其中對話／計畫先行拓撲不是現行產品入口。

## 1. 現行主流程

URL → 安全公開來源快照 → 產品事實／推論／必要缺口 → 第一可用成果 → 版本 review → 授權發布 → 發布證據與觀測 → 效果回訪。

沿用 apps/web 的靜態 HTML／ES modules、既有 Supabase Auth/API 與獨立 Preview，不因方向調整重寫框架。URL 讀取／模型協調需受控服務端邊界，不能由瀏覽器任意 fetch 或透過既有高權限 key 代理。具體服務端路由與增量 schema 尚待設計；本文件不是部署或 API 已完成宣告。

## 2. 模組定位與復用

| 模組 | 現行責任 |
|---|---|
| URL/Source（新增） | 正規化、安全讀取、頁型與產品識別、immutable 快照與來源引用；復用 scanner 可用部分 |
| Result（新增） | 產品頁 title/meta/描述改善包；事實驗證、缺口及實際可用文本，不先要求完整目標表單 |
| Review/Auth（整合） | 復用版本、receipt、owner/viewer、tenant、取消／漂移失效及跨登入恢復 |
| Plan/Work（內部） | 重用契約／stateRevision／事件；只保存閉環必需的進度，不暴露複雜管理 onboarding |
| Publish（新增） | 一個授權試點平台的預覽、冪等發布、讀回／audit／恢復；未接線時只匯出、未發布 |
| Measure（整合） | 復用 CSV／observation 契約，連結頁面、成果版、發布時間與授權來源；SEO/GEO 分開 |
| Conversation/Profile（fallback） | 只有關鍵缺口才詢問，保存補充資料；不作主入口 |
| Conversion／多渠道 | 延後，原安全與口徑約束保留在歷史設計 |

## 3. 不變的安全／資料契約

公開網域／redirect／DNS／实际連線位址验证，拒絕 credentials、loopback、private/link-local/metadata、登入內容與任意 JS 執行；限制超時、bytes、跳轉及每站請求數。來源內容為未受信任資料，不得驅使工具擴權；來源快照需有 URL／擷取時間／版本／引用。

所有保存與平台操作有 organization scope、實際 session membership／API／RLS 檢查；前端角色、memory session 或內容 fingerprint 不代替 Auth。來源／版本／內容修改令核准失效；所有版本／audit 不覆寫。發布是獨立狀態，結果不明先核查，禁止盲目重試或把內部 completed 當發布。

資料來源、定義、期間／時區、覆蓋、蒐集時間、限制可查。缺資料保持未知，不當 0；合成、提供者聲明、系統核查分開。原觀測／轉換口徑保留，轉換模組不阻塞首版。

## 4. 畫面與驗收

主要 UI 是貼網址、成果對照、必要確認／授權、發布狀態、效果及下一步。來源／版本／稽核展開；plan/work 等內部事件隱藏。錯誤在相關操作旁，保留输入並可恢復；手機／桌面／鍵盤皆可完成。已知資訊不重問，不能用假進度或模型未接線的占位成果表示成功。

歷史固定問答／草稿／plan demo 的 PASS 保留，不代表新 URL 路線已完成。現有遠端邊界與新整合各自驗收；工程順序／放行條件只引用 [藍圖第 8 節](AI_Company_Growth_OS_執行藍圖_v1.md#8-更新後的工程路線圖與驗收)。本輪無程式、migration、Auth、DB、model 或發布變更。
