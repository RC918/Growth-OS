# 持續版本 Review：隔離測試站離線部署候選

Owner 2026-10-04 07:48 只同意方向；Reviewer `01a105e3` 方案 APPROVE。**未批准任何 remote DDL/ACL/config/資料寫入**。本包在 drafts，不在 migrations discovery，也未改 served config。修正基準 `c4ae4ec34df52a1271a059db0301adc905b54a1f`，CI `37187566457` success。該版仍是未批准候選；本次依Reviewer `01a1061a` 補啟用前P2 audit ACL blocker。父07:53–07:54 UTC唯讀核對project ACTIVE_HEALTHY／PG17.6、history23（最後20261004050737）、四個Save entry閉鎖、URL Save body hash吻合及URL Review RPC不存在。現有人群：Fixture A兩位Owner（8fc0dd39-a9d9-4a56-80b9-362768547d81、e85f1a90-3565-4fc1-a7e0-3b7d08830d0e），Fixture B兩位viewer（5d14dbf9-e9ef-453b-8760-e48a20fa63ad、9dd82ae4-2263-4af6-bf6b-84085234b0e2）；詳manifest。這不證明無production共用：hosted隔離、Auth redirect/signup、exact deployment仍pending，完整history/catalog/preservation仍須execution-time核對；未讀credentials/token。

## Audit ACL P2 前置修正

父08:48 UTC有效權限、08:51 raw ACL核實：`public.audit_events` owner postgres、RLS=true/FORCE=false，raw ACL為 `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`；沒有PUBLIC grant，唯一policy為authenticated的`audit_read_owner` SELECT，qual `private.has_org_role(organization_id, ARRAY['owner'::text])`。anon/authenticated四種直接寫權均true；其他三個成果表四種直接寫權false。TRUNCATE不受RLS，所以必須在持續Review啟用前撤權。**P2 Blocking，無利用或資料受損證據，不稱P1事故。** Hosted尚未撤權。

獨立tracked `audit-revoke.sql` 僅移除audit_events的PUBLIC/anon/authenticated INSERT、UPDATE、DELETE、TRUNCATE；PUBLIC目前無grant，包含它防止保留同類public路徑。執行前要求父核實的完整raw ACL、owner/RLS/唯一SELECT policy及23筆history精確符合，不用CASCADE、不改service_role、其他表/schema/role/default privileges。交易內核精確expected-after ACL與原policy／owner／RLS及資料hash，合法SELECT、REFERENCES/TRIGGER/MAINTAIN、postgres/private-definer audit寫入保留。`audit-postflight.sql`獨立核raw/effective結果。任何漂移或unknown先只讀對帳，不擴撤權範圍。

`enable.sql`／`restore.sql`及兩個Review postflight都要求anon/authenticated四個audit有效寫權false且PUBLIC無四種grant；重新出現任一寫權就拒絕，不以SELECT-only RLS替代ACL。恢復只恢復Review entry EXECUTE，不恢復被移除的audit權限。

## 適用範圍與差異

project `vhzryhibmpvglzcmfnaa`、Growth OS Preview 的指定 branch alias 見 manifest。alias 不等於 immutable deployment 身份，執行前還須綁定 exact deployment ID／HEAD／config hash。這是正常 Auth＋membership 的既有產品功能，沒有 synthetic hosted Auth、測試token、登入bypass、新帳號或 secret。

此包逐字復用 `../proposal.sql`，沒有把 bounded 模板刪 cutoff。新增五欄、兩 constraints（含unique index）與兩 RPC；public invoker／private definer 均 empty search_path，實際 owner/role/tenant/latest/digests/locks/audit 由既有 SQL 控制。legacy guards 不變。

**authenticated 可 EXECUTE 兩個 Review entry**；實際 SQL 只允許同 org 當前 Owner 確認該 parent 最新已保存 URL draft，並核 source/content/version digests 與五項checks。同 request exact replay只返回既有歷史，不核准新版。viewer/editor不寫，合法同org成員只讀；foreign不可讀寫別org。PUBLIC/anon/service_role不新增有效 EXECUTE，不新增任何table write grant。不得宣稱固定本Owner、固定v2或一次request：範圍是此測試project所有符合條件的org Owner／最新URL版本，含後續合法membership／版本變化。

Save始終closed，候選不建立parent/version，不擴Publish/Measure/100cap。功能**沒有自動到期**；action-time窗口與授權另列，manifest為null不猜短窗口。持續期間每次合法確認1review+1audit，沒有單次bounded的全生命週期總量上限；最初真人驗收是否要做、帳號/版本/最大POST數需在獨立批准中指定，這不是每日regression前置。

## 檔案與操作順序

1. 父核project隔離、Preview deployment綁定、既有人群/Auth設定及DB基準；核原23 history全row/statement hash與closed Save body，不只計數。任一pending不進remote。Owner再批准本包exact commit／hashes、audit revoke+initial install+enable、paired configs、action-time窗口、允許的人群與正常使用資料写入範圍、停用權限及恢復是否須再批。
2. 先以`state.sql`＋`preservation.sql`抓原23筆history／資料／catalog及完整raw ACL baseline。Owner另行批准後單次tracked執行`audit-revoke.sql`（23→24），核`audit-postflight.sql`與精確ACL allowlist；其他資料／policy／角色／service_role不變。再跑`preflight.sql`：Save與audit閉鎖、RLS、無Review安裝，history必須24且唯一`url_review_persistent_audit_revoke`記錄的statement SHA吻合本包。這不是缺記錄時補history的授權；unknown一律核原操作不重送。
3. 單次tracked `install-closed.sql`（24→25）：原proposal的DDL/RPC預設closed、同一DO核exact schema/body/ACL，失敗回滾SQL。不得重跑已安裝／部分安裝；hosted migration-history＋DDL是否原子仍不能假定，未知走state對帳。verify `postflight-closed.sql`，所有業務資料零增量、原history逐row不變，只新增批准的history。
4. 部署 `preview-disabled-config.mjs` 到兩份指定config路徑，Save=false、Review schema=true/gate=false、trial=null；核immutable deployment ID/HEAD/config hash及schema/ACL。這是安裝後合法唯讀config，不可在schema未完成時部署。
5. 另一次tracked `enable.sql`（25→26）：重核原Savebody、RLS、無direct writes、exact Review schema/function與closed ACL才grant authenticated。核`postflight-enabled.sql`、preservation；最後部署enabled config並核對部署身份。ACL先於UI，仍僅在批准action窗口執行。部署失敗保持gate closed、對帳後依批准disable，不盲目重試。
6. 正常Auth使用；unknown Review只能既有marker原request／known UUID GET-only，見`reconcile.sql`。不清pending marker、不換request、不覆寫歷史、不重送推定未成功。
7. 停用：先部署disabled config，再執行獨立tracked `disable.sql`撤兩entry的有效EXECUTE，核closed postflight。舊開頁gate不是安全邊界，DB撤權拒絕後續呼叫。**已通過權限檢查的in-flight交易不會被REVOKE回溯取消**；停止新入口、等待／只讀核對在途結果與audit後，才記錄靜止baseline。若仍活動或結果未知，回報未完全靜止、不強制kill、不聲稱零新增。成功review/audit、schema、payload、marker及合法讀取保留。
8. 恢復：以disabled config且有效ACL closed開始，重新核hosted deployment/schema/ACL、完整preservation及在途對帳。另經所需批准用`restore.sql`；它只重核並grant，不重建schema、不替換body、不清marker。核enabled postflight後才換enabled config。drift先停，不讓restore修復未知狀態。

初始計畫改為3 tracked migrations（audit revoke、closed install、enable）及2 config transitions（installed readonly、enabled）；disable／restore是分列的條件操作，不能由方向批准推定已授權。每次新migration記錄實際唯一version與原始statement hash；重複disable/restore不能忽略重名history，先state對帳再核新action記錄。SQL不檢測Vercel身份或Supabase project ref，這些必須由執行前external核查與批准鎖定，不偽造SQL可識別host。

## 保存與unknown對帳

`hashes.json`包括manifest、SQL、expected schema、paired configs與本runbook；候選最終HEAD由外部批准綁定，避免自我參照hash。`state.sql`讀完整migration history、Review schema/function、effective ACL、raw ACL與角色繼承。`preservation.sql`全表count/hash、舊catalog與完整history，沒有用廣泛review request排除掩蓋資料變更。安裝前後只從舊review row projection移除五個新增nullable欄位；DDL/DCL期間全業務投影須相同。catalog的唯一新ACL allowlist是audit_events的PUBLIC/anon/authenticated四種寫權：在正規化比較中僅排除這些ACL entries，另由audit-postflight核完整expected-after；SELECT、service_role、owner及其餘權限仍逐項比較，不能聲稱全部ACL不變。完整history不做排除，每筆新增tracked操作須比對批准name／statement hash，原23筆逐row保留。

正常使用後review/audit可以合法增加：依pre/post exact IDs核對每筆新增review、對應version/actor/request/digests/checks及1:1 audit；所有preexisting rows（含review/audit）須逐row/hash保留，其他表零差異。不能拿增量總數相同代替對帳，也不能刪history或資料來修復。DDL/DCL未知須核history statement bytes、schema/body/ACL，部分成功/缺記錄/歧義即停並回報；只讀結果不直接授權重送。

## 離線驗證與交付

`node candidate.mjs`僅於本目錄materialize；`node --test supabase/drafts/url_review/persistent/candidate.test.mjs`驗audit revoke→closed install→enable→disable→restore、權限／不變資料／drift fail-closed及pending marker讀回。重用既有Review SQL/native/UI suites與日常無人值守入口；新增只驗持續生命週期差異。不部署test runner。

具體本機與同HEAD CI結果由交付回覆記錄；synthetic session與真SQL隔離證據分列，真Auth engine發證/JWT/OTP/2FA未測。本包不是完整M3/live驗收。runtime仍原closed SHA `fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b`，既有bounded/frozen保留。P3 marker文案延期。


本次必要差異實測：candidate Node runner 6 PASS（5子情境）；disposable PG17重現anon/authenticated TRUNCATE成功（交易回滾保留資料），撤權後兩角色INSERT/UPDATE/DELETE/TRUNCATE均permission denied，正常Owner/private-definer RPC仍1review+1audit，注入audit失敗時整個Review回滾；合法SELECT、RLS、service_role、舊資料與其他catalog保留。原5並發與持續生命週期回歸PASS。上輪1280/390 UI證據保留，本slice無UI變更；同HEAD完整CI繼續執行既有UI及無人值守入口。生命周期API用實際paired configs與authenticated SQL，合成HTTP邊界，不是hosted Auth。首次整合的測試transport曾直接傳PGlite Date／全row，與實際HTTP JSON／SELECT projection不符，另誤期待內部lost-response字串而非API既有標準網路錯誤；根因核對後修測試邊界並通過，產品未改。CI復用現有Review SQL及native步驟，無新增框架或工作流。
