# Growth OS｜系統設計 v0.2

更新：2026-10-10（持續服務增量；沿用 v0.2 與歷史檔名）。產品方向及 M0–M6 唯一依據為 [執行藍圖 v2.0](AI_Company_Growth_OS_執行藍圖_v1.md)。[原技術設計完整歷史](Commerce_Growth_系統設計_歷史_2026-10-02.md)保留；其中對話／計畫先行拓撲不是現行產品入口。

## 1. 使用者產品流程

網址 → 第一份可用成果 → 確認／必要微調 → 授權發布 → 量測。安全來源快照、必要分析、保存／恢復、版本與權限核對由系統支援，不增加 onboarding 操作。價值是有依據的網站改善落地與相關流量觀測；title/meta/描述只是目前交付切片。

兩張現行流程圖只維護於[藍圖使用者流程](AI_Company_Growth_OS_執行藍圖_v1.md#user-product-flow)及[內部驗證順序](AI_Company_Growth_OS_執行藍圖_v1.md#internal-validation-order)，此處不另定順序。①核心可靠→②執行端受控站單平台發布→③版本／頁／發布時間／改善前基線／後續觀測關聯→④Owner 自有真內容且開放搜尋站→⑤修正後外部商家。外部商家不是工程前提，Owner 既有站本次未授權修改。

沿用 apps/web 的靜態 HTML／ES modules、既有 Supabase Auth/API 與獨立 Preview，不因方向調整重寫框架。URL 讀取／模型協調需受控服務端邊界，不能由瀏覽器任意 fetch 或透過既有高權限 key 代理。URL API 與成果保存／Review 已有增量實作，單平台發布與可信量測鏈仍待完成；各能力的已實作／隔離通過／線上通過／目前開放狀態見 PROJECT_STATUS，不由本文件推定部署完成。

## 2. 模組定位與復用

| 模組 | 現行責任 |
|---|---|
| URL/Source（已有切片） | 正規化、安全讀取、頁型與產品識別、immutable 快照與來源引用；復用 scanner 可用部分 |
| Result（已有切片） | 有依據、可落地的網站改善，現有交付為產品頁 title/meta/描述改善包；事實驗證、缺口及實際可用文本，不先要求完整目標表單 |
| Review/Auth（整合） | 復用版本、receipt、owner/viewer、tenant、取消／漂移失效及跨登入恢復 |
| Plan/Work（內部） | 重用契約／stateRevision／事件；只保存閉環必需的進度，不暴露複雜管理 onboarding |
| Publish（受控資產，補關聯） | 先在執行端受控測試站完成一種平台授權與預覽、冪等發布、讀回／audit／恢復；未接線時只匯出、未發布 |
| Measure（整合） | 復用 CSV／observation 契約，連結頁面、成果版、可信發布時間、改善前基線、後續觀測與授權來源；SEO/GEO 分開 |
| Conversation/Profile（必要校正） | 成果旁少量必要問題，復用有效答案；補範圍、版本、來源與依賴，不作主入口 |
| 持續／批量／多渠道 | 依藍圖 A–D／W3–W5 正式分階段放行；各渠道權限、回條與撤回分開 |
| Conversion | 保留契約；有效訂單／CRM 資料未接通時收入歸因 unknown |

## 3. 不變的安全／資料契約

公開網域／redirect／DNS／实际連線位址验证，拒絕 credentials、loopback、private/link-local/metadata、登入內容與任意 JS 執行；限制超時、bytes、跳轉及每站請求數。來源內容為未受信任資料，不得驅使工具擴權；來源快照需有 URL／擷取時間／版本／引用。

所有保存與平台操作有 organization scope、實際 session membership／API／RLS 檢查；前端角色、memory session 或內容 fingerprint 不代替 Auth。來源／版本／內容修改令核准失效；所有版本／audit 不覆寫。發布是獨立狀態，結果不明先核查，禁止盲目重試或把內部 completed 當發布。

資料來源、定義、期間／時區、覆蓋、蒐集時間、限制可查。缺資料保持未知，不當 0；合成、提供者聲明、系統核查分開。原觀測／轉換口徑保留，轉換模組不阻塞首版。

## 4. 畫面與驗收

主要 UI 是貼網址、成果對照、必要確認／授權、發布狀態、效果及下一步。來源／版本／稽核展開；plan/work 等內部事件隱藏。錯誤在相關操作旁，保留输入並可恢復；手機／桌面／鍵盤皆可完成。已知資訊不重問，不能用假進度或模型未接線的占位成果表示成功。

歷史固定問答／草稿／plan demo 的 PASS 保留，不代表新 URL 路線已完成。現有遠端邊界與新整合各自驗收；工程順序／放行條件只引用 [藍圖第 8 節](AI_Company_Growth_OS_執行藍圖_v1.md#8-更新後的工程路線圖與驗收)。五類驗收分列功能可用、發布正確、數據可信、成效觀測、使用負擔；測試 PASS 不等於流量價值。日常 Auth 沿用隔離 synthetic 入口，不依賴 Owner email／2FA；真人必要 checkpoint 只阻擋相依操作。

本輪只對齊文件，無 runtime、SQL、frozen、Auth、remote／restore、模型、live URL、費用、正式發布或 Owner 既有站改動。新增費用、帳密、外部授權或既有網站修改須由父提出具體需求，不從方向修訂推定批准。

## 5. 業務資料、依賴與一致性（設計契約，尚非已部署能力）

保留 UI／ES modules、受控 URL／模型服務端邊界、Auth／資料庫、scanner、版本／review、publisher、measurement、audit 與既有執行器。增量責任由原模組承接，不要求每項另建服務、Agent 或資料表；實際 schema／migration 在 W1 先核再定。

業務資料最小契約：organization／workspace、site、產品／市場／渠道範圍；類型為產品事實／業務偏好／授權且不可混用；值、版本、來源類型（網站觀察／商家確認／系統推論）與引用；確認者／時間、有效起訖或重確認條件、取代關係；待確認／已確認／衝突／過時／已取代狀態；使用該版的成果／任務依賴。商家確認不冒充外部證據；不同產品、市場不混套；抓站不覆寫偏好，矛盾先保留差異不自行擇真。

匿名 URL 起跑保留，只有授權工作區才能承諾長期保存。memory、localStorage、聊天歷史不能替代後端權威。提問記原因、決策、證據、未答處理與略過／待答狀態；UI 說明答案用途，保存／內容確認／發布分開。

| 變動對象 | 契約 |
|---|---|
| 未執行任務 | 更新輸入版／排序並記原因 |
| 草稿 | 新版綁精確事實與來源版，保留舊版 |
| 已核准未發布 | 相依事實變動使舊批准不可再發布，重新確認確切版本 |
| 已發布 | 展示差異；按有效授權處理，否則只備候選 |
| 完成紀錄 | 不改寫當時內容、觀測及限制 |
| 不相依工作 | 繼續，不擴全域封鎖 |

答案更新與相依過時標記必須一致；發布前權威重核事實／來源／內容版本，避免併發送出舊宣稱。依賴不明先擋相關發布。request 結果未知只讀回原操作，不盲目重送；重複觸發／重啟不能重播副作用或重置次數／預算。

R7 固定 frame／candidate hash 與 validator 保持原樣；它是固定介紹成果保存切片，不能放寬為任意文案／通用業務知識，也不能修改 frozen 證據或 hash 讓驗收通過。一般事實使用隔離契約與必要介面。

<a id="w1-proposal"></a>

## 6. W1 具體提案與復用映射（待原 Reviewer／父派工）

最小成果：一項產品的「是否支援戶外使用」必要事實，先展示有來源候選及安全未知版本，成果旁回答／略過；保存答案後建立相依草稿新版，舊核准失效；隔離全新 session 讀回正確 org／產品／版本／來源／確認狀態，UI 就近交代刪除或加入哪項宣稱及原因。沒有真模型用量批准時只用醒目標示的 synthetic 工程素材；不稱真 AI 理解或目標環境已可用。

| 既有資產 | 已核用途／W1 缺口 |
|---|---|
| `supabase/migrations/20260929015843_business_profile_review.sql` | org owner 保存／核准與 audit 可參考；目前 Profile upsert 不等於不可變答案版本與產品依賴，不直接當 W1 完成 |
| `apps/web/first-result-payload.mjs` | 精確 snapshot／引用／內容摘要與 page-only receipt 驗證；新增事實依賴需適當新契約，不把商家答案偽裝網站引用 |
| `apps/web/first-result-review.mjs` | edit 使 receipt 失效、revision 遞增；僅頁內核對，W1 另需權威持久依賴失效 |
| `apps/web/saved-result-review.mjs`、`url-result-save.mjs` | expected_version、原 request reconcile、舊版保留、未保存／未發布 UX 可復用；補答案→成果的關聯，不能只改文字即稱完成 |
| `apps/web/typed-draft.mjs` | 保存版本、來源與非發布狀態顯示可復用；補答案用途／作用範圍／衝突提示 |
| `prototype/owner-workspace/saved-result-review.test.mjs`、`prototype/public-audit/first-result-review.test.mjs` | 既有版本／review 資產；僅對 W1 新依賴與可見結果補必要隔離驗證 |
| R7 專用入口／callback 與保存包 | 引用已接受登入／唯讀證據；固定契約、frozen workspace 三檔及其證據不動，W1 另設必要介面，不將 R7 權限當一般寫入批准 |

W1 工程起點先核實 general schema、可復用 Auth adapter 與 frozen 範圍，選現有非 frozen 入口或最小隔離入口；不重寫框架。W0 不定稿未核的欄位 migration，不執行遠端 SQL／grant、flag、部署或新模型。指定環境啟用、真人必要環節另依有效 envelope；隔離可做的工作持續。

必要驗收矩陣：有有效答案不重問；未知略過仍有安全成果；A/B 產品與不同市場隔離；owner 可寫、viewer／他 tenant 不越權；修改答案產生新版且舊版不變、舊批准不可用；來源矛盾顯衝突；併發版本過時拒絕；回覆丟失只 reconcile 原 request；logout→獨立 context／token 的 fresh login→精確讀回；桌面／手機／鍵盤完成流程與近端回饋。UI mock、隔離 DB/Auth 與目標環境證據分列，通過哪層就報哪層。

## 7. 持續觀測與執行責任

scanner／observation 先驗資料可比較與品質，再標變化；故障不報零、資料不足不報重大異常。Plan/Work 接有根據的修正、唯一工作、有效授權、retry 上限與原操作讀回；publisher 核事實／來源／成果版並讀回；Measure 分開發布正確與效果，策略改變記比較限制。摘要提供已完成、未知、待決定、下一步與成本，無需修改時可安靜持續觀察。

W3／W4 必須使用真實支持的觸發／排程／持久任務能力，保存觸發時間、任務身分、接收／執行／完成回條與恢復／下一步；缺能力明示，不以文件當服務。產品自主服務與 Dot/Codex controller 分別驗。撤銷／到期／成本超限由服務端拒絕相依操作，不靠隱藏 UI；不同外部副作用有各自授權。具體階段與放行條件只依藍圖，不在此另立路線。
