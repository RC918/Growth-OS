# ③ 確切版本的發布／量測視圖

基準 `3c8f7c4c70ae252e0431ab76c2908181a34a2582`。父確認既有 Reviewer `01a10817-6f24` 對② **APPROVE_WITH_DEFERRED_DEBT**；CI `37222164405`／Preview `6TKHHKWmAMbw7DWQ48KkKHqrLxF6` success。Dot 指派③，①／②既有驗證保留；本 Core 完成後仍交既有 Reviewer，Primary 不自行最終驗收，也不自開④。

## 使用者可用路徑

已保存 exact version 的既有「量測準備」位置，在受控 WordPress 功能啟用時顯示「此版本的發布與量測」。讀取該版本的核實發布紀錄，選擇同版某次發布，檢視頁面、首次發布（平台紀錄）、**此次修改**、讀回、恢復開始／恢復讀回及 restored 狀態；關聯兩份可選的頁面級每日 CSV，再讀回前後觀察與資料缺口。沒有某版發布證據時明示未知，不借用同頁其他版本紀錄。

- **歷史唯讀與最新發布權限分開**：`publisher.mjs` history／measurement 使用 read authorization；復用 `readSavedUrlDelivery` 的 exact version／source／tenant／latest-or-historical 檢查與 `readUrlReview`。新版本存在後，歷史 publication／measurement 不消失，舊版 publish／restore 權限沒有因此重新開啟。
- `readPublicationMeasurement` 在讀寫前後再次檢查原 version/source/page/digests 與 session；外來 org、版本、來源或頁面的回應拒絕。server 只從已核對 journal 挑 publication，不接受 browser 自填發布時間或已驗標記。
- 觀測資料追加到**既有 run-local publication journal**（`kind: measurement`），沿用同一 evidence sink／ledger；沒有新 schema、通用 store、provider 或跨 run grant。新瀏覽器 session 能讀回同版資料；server restart／run 結束後不保證保留。
- `checkPageCsv` 保留原預設限制；受控 publication 的 literal loopback origin 才可帶本機 port。**頁面 href 比對仍包含 port／path／query**，移除 port 僅用於既有每日算術驗證，沒有網路請求或 URL 身份正規化放寬。重用 `search-baseline.preview/compare`（既有 report 的算術來源），不另寫差額演算法。

## 資料與時間語意

1. source 必須仍是 `synthetic` 或 `provider_asserted`，另記明確來源名稱；before/after 的來源名稱、聲明類型、搜尋類型、完整 page URL、filter 與 UTC 日口徑須一致。未接訪問／轉換／AI 可見度 provider；訪問量不能當搜尋點擊。
2. 每日 CSV 為 **UTC 完整日**，不自動轉換來源時區。基線日結束須不晚於本次 `modified_at`，不是網站首次 `date_gmt`；後續完整日開始須不早於核實讀回，日結束不得越過 `restore_started_at`。用恢復**開始**而非較晚的讀回作保守 cutoff；同一 journal 有後續同頁核實發布時，也以其修改時間截斷舊版本期間，兩者取較早者。
3. 期間、匯出時間、CSV 實際 rows、覆蓋／缺日均重新核對。匯出不得早於完整觀測日結束；提供者聲明不可使用未到達的日期／匯出時間。來源、scope、日期不合格的保存拒絕，不寫新 measurement entry。
4. 為驗證剛發布的受控站，synthetic 可使用明示的未來日期情境；畫面始終顯示「合成情境／非真流量／未實際觀察」，`traffic_verified=false`、`period_verified=false`、`causal_claim=false`。這不是提前取得真實後續資料。
5. 缺資料 → unknown；明確 `0,0` → 已提供日期為零、CTR unknown；缺日不补零，不能比較。只有完整、等長、不重疊、同口徑期間才沿用 compare 顯示**觀察／情境差異**，不宣稱成長或因果。
6. 恢復後保留原 CSV／發布證據，但每次讀回重新判定適用性。已落在恢復之後的 synthetic followup 被排除，基線可保留；差異回到 unknown。未知恢復／分歧狀態不拿後續資料冒充改善曝光期間。歷史 v1 與最新 v2 不能互借證據。

## Agentic Verification Loop

| 驗證點 | 適用性、結果與證據 |
|---|---|
| PLAN | 適用：③ exact version/page 的受控發布→量測；不擴④真站試點／新 provider／持久 store |
| CODE | 適用：既有 measurement-preparation 分支、新薄視圖／關聯契約、同 journal observations；原發布寫入路徑與授權不擴張 |
| UNIT / CONTRACT TEST | 24 tests PASS：新關聯 4、既有量測及 exact response／session 增量 8、頁面 CSV 7、WordPress 5；錯頁／port、來源名稱、時區、search type/filter、錯期間／匯出、provenance 升格、缺日、restored、tenant/source/version/session 拒絕 |
| BUILD / RUN | 適用：原 pinned WordPress／MariaDB 及實際 Node/static UI 入口；無 bundle build，以真執行證據代替 echo |
| BROWSER / DOM CHECK | 適用：Chromium 實際量測表單／輸出；mobile min-width 修正後無 overflow，無 page errors；每尺寸 screenshot |
| DESKTOP + MOBILE E2E | 適用：1280／390 均從①→②真受控發布→兩份 synthetic CSV→保存→fresh readback→restore→歷史版；錯頁／错期間／缺日及 late response 拒絕 |
| DATABASE / AUTH CHECK | 適用：原 PG17 六案、PGlite authenticated／tenant、WordPress 原生短期 App Password／到期撤銷全保留；量測不增加 WP 或 SQL mutations |
| SAVE | 適用：觀測追加原 journal；前後 CSV、來源名稱／UTC、原 publication ID/version binding 可核查；不是 hosted Save |
| LOGOUT | 適用：原 UI sign-out，未擴稱為真 Auth server revoke |
| FRESH SESSION / LOGIN | 適用：沿用原入口關閉舊 context／全部分頁，新 context/token、空 cookies/storage；synthetic workspace session，不是真 Auth／OTP／2FA |
| READBACK | 適用：新 session UI 取回同版比較；恢復後重算適用性；v2存在時 v1 仍能讀原發布／基線，v2 未發布顯 unknown |
| TENANT / PERMISSION CHECK | 適用：viewer／foreign measurement denied；client 收到錯 org/version/source/page 也拒絕；登出時延遲 measurement response 不回填；歷史發布按钮仍 disabled |
| VERIFY | 本機完整入口 PASS；原②每尺寸仍只有 2 publish＋2 restore，measurement 零額外 WP/SQL 寫入；control/meta/非目標欄位與保護 hashes 保留。新 HEAD CI／Preview 另核，既有 Reviewer 裁決待回 |

重現：

```sh
node --test prototype/owner-workspace/publication-measurement.test.mjs prototype/owner-workspace/measurement-preparation.test.mjs prototype/owner-workspace/page-observation.test.mjs prototype/wordpress-publish/publisher.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --wordpress
```

原 CI 入口及 `controlled-wordpress-evidence` artifact 沿用，新增 measurement／historical-restored screenshots 和同 journal observations。官方 image digest、TLS client-local trust、900 秒 grant／撤銷、owned-only cleanup 沿用[②資源邊界](Controlled_WordPress_發布驗收_2026-10-04.md)；不 prune、不刪非本 run 資源，原 Auth fixture／SQL／flags／frozen 不動。

本輪必要修正：DOM select 的只讀 type 初次初始化錯誤（P1，本視圖不能開啟），改為只替 input 設 type；手機 select／fieldset min-content 溢出（必要 P2，可用性），僅加視圖局部寬度限制。相關點修正後完整重驗，未擴無關維修。

## 已允許延後的 Technical Debt／未驗證項

| 問題／位置／發現證據 | 嚴重度、影響、延後與重看條件、追蹤 |
|---|---|
| 多 writer 原子競態，`prototype/wordpress-publish/site-plugin.php`／publisher；② `3c8f7c4` 原生 endpoint＋單 runner 串行證據 | P3，Reviewer `01a10817-6f24` 允許延後。本 Core 仍只有受控 single writer，不阻塞；不保證 production concurrent CAS／exactly-once。暫維持 isolated／default disabled；任何外部或多 writer 站接入前重看原子 precondition／reconciliation。追蹤待 Dot 指派。 |
| 跨 run／server restart 的 grant、publication／measurement 持久化，site／publisher journal；② `3c8f7c4` cleanup，③ fresh browser readback | P3，Reviewer 允許延後，Owner 明准③沿用 run-local journal；本次只保證 run 中 fresh browser session，故不阻塞。暫明示生命週期、保留 synthetic artifact；需要跨 run 持久量測／真站產品化前重看 durable state 與 grant lifecycle。追蹤待 Dot 指派。 |
| 真資料信任與其他時區／訪問口徑，`publication-measurement.mjs`；本 Core source/UTC/unsupported tests | P3，當前為受控 synthetic 量測關聯，非 provider connector，因此不阻塞。暫只收 UTC 搜尋日資料、來源聲明不升格，其他時區需明確轉換而非默認；有授權真資料來源／Owner ④需求時重看。追蹤待 Dot 指派。 |

未驗：真站品質、真流量、持續平台 grant、真 workspace Auth、跨 process 恢復、成長因果與完整 live M3。Owner 既有站、公開／付費服務、外部 OAuth／帳密、hosted restore/login/Save/Review POST、live URL、模型均未執行。hosted DB27 是父既有已核狀態，本次無 hosted DB 操作；runtime disabled SHA `8b25cfa17adaf27a10b635fbf3537f0ad19deb36c10bb4263f1733da83ee91e1`（兩份）、frozen index `11e3423b1f58b280612069c91debbe68df14ed290afb0c0d64dcfaec83783351` 不變。
