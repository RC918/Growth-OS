# 新專案 business schema 候選（未套用）

本包從 PR24 `3cc7d84776de88f7e5f480426369353735ac9ae1` 延續已接受的 membership、payload、版本、Review、audit 與 URL Save RPC 契約，供未來新空專案一次批准。不是 RC schema，不含 identity seed；不自動被 `supabase/migrations` 掃入。此 Core 只在 disposable PostgreSQL／GoTrue／PostgREST 驗證，沒有 hosted SQL、設定、帳號或 Data API 操作。

## 精確物件與權限

`manifest.json` 是完整 table／policy／function signature／ACL 與來源 SHA256 清單，`build.mjs` 只挑選原定義，不 import RC builder 或 identities。`install.sql` 是完整單一交易；原生 `auth.users`／`auth.uid()` 必須已存在，creator 必須是 postgres、public 無 business relation、private 不存在、postgres 的 global／public future-table API defaults 已關閉；不符即失敗，不修正或 reset。

- 14 張 public tables：organizations、organization_members、sites、audit_events、business_profiles、growth_opportunities、opportunity_sources、opportunity_decisions、content_versions、content_reviews、content_action_plans、search_observation_versions、growth_goals、growth_goal_turns。保留已接受的 read-side UI 相容性，未加入 legacy writers。
- 每表 RLS + 原 SELECT policy + 明列 authenticated SELECT；PUBLIC／anon／service_role 無 table grants。沒有 INSERT／UPDATE／DELETE／TRUNCATE、grant option 或 `ALL TABLES` grant。
- public 只建立 `save_url_result_draft(uuid,uuid,uuid,integer,jsonb)` 與 `review_url_result(uuid,uuid,uuid,text,text,text,jsonb)`。安裝時兩者及 private implementations 不可由 API roles EXECUTE；private helpers 只有 `has_org_role(uuid,text[])` 給 authenticated EXECUTE 以支援 RLS。所有函式明確移除 PUBLIC／anon／authenticated／service_role 預設 EXECUTE，再僅加回清單。
- private schema authenticated USAGE 用於 public invoker → private definer 與 RLS；不得暴露 private Data API。SECURITY DEFINER 僅 membership predicate 和兩支 writer implementation，固定空 search_path、postgres owner；不建立 BYPASSRLS client。
- `enable-save-review.sql` 只對 authenticated 授予兩支 public RPC 和兩支 private implementation EXECUTE（精確四個 signatures）；`disable-save-review.sql` 撤回同四支。未來 activation 必須與業務批准、gateway 到期、Auth/RLS 驗證一致。停用不刪資料；unknown 只 GET 核對，不能重送。
- 不修改 ALTER DEFAULT PRIVILEGES、既有 auto-RLS event trigger、Auth、extension、role 或其他 schemas。未來新表仍無 API default grants；不使用 browser service_role。

## 未來一次批准包（目前不得執行）

目標只能是 Owner 指定的新專案 `wqepyttadrcnphtyjpjy`；舊 DB27 不適用。本任務未讀該專案，public 0 tables／Data API OFF／auto-RLS ON／future-table defaults 關閉為父派工提供的基準，並非本輪 live 證據。

1. 批准時固定 repository commit、`manifest.json` 與三支 SQL hash、操作者、目標project、時間窗、唯一 approved Auth user ID／org ID／角色與 gateway activation；Data API 開啟／public exposed schema、登入、持久 membership、部署均須同包明列，不能由本候選隱含授權。
2. 只讀 preflight 核 new-project identity、public 空、native Auth、existing role inheritance／schema usage、future-table defaults、auto-RLS 與 Auth functions 快照；有差異停止。Managed defaults 與 local fixture 相似不是已證實相同。
3. 以 postgres creator 完整執行 hash-pinned `install.sql` 一次。timeout／lost response 先查 catalog／ACL／migration receipt，禁止 blind reapply 或改名重試。只讀 postflight 逐項比對 manifest、函式 bodies／security／search_path、RLS policies、explicit grants；比較其他 defaults／Auth／ensure_rls 快照不變。安裝保留 writer closed。
4. 身分初始化須獨立於 schema：由已批准 native Auth 流程建立／確認真 user；用可信伺服器 `/auth/v1/user` 及 operator admin read 確認 UUID 與確認狀態，核 Owner 指定 identity。不得從 client `user_metadata`、email domain、第一位 signup 或 fixture UUID 推定 owner；不得 SQL 寫 `auth.users`、輸出 token／password 或把 service key 放 browser。
5. Owner 確認實際 org 名稱、business_model、唯一 org UUID 與 user UUID 後，operator 使用參數化單交易：確認該 Auth user 存在、目標 org/membership 尚不存在，新增一筆 organizations 與一筆 organization_members(role=owner)，核精確返回 UUID/角色。既有或不一致即停止，不 UPSERT 擴權，不自動建立 viewer／foreign／synthetic accounts。此步無可直接執行的預填 seed，需批准時填實際參數。
6. 原生登入確認目前 membership／tenant／read-only ACL；批准後執行精確 `enable-save-review.sql`，核 authenticated 只多四個 EXECUTE。依批准的一次 Save／Review、登出／新 session exact readback 驗證，不把 local evidence 當 hosted receipt。Data API／gateway／publication 授權分列；本包不啟用 Publish。
7. 到期或安全停止先執行已批准 disable（四支 EXECUTE），關閉 gateway activation；資料保留，未知寫入查 request/version/audit。恢復不能自行延長批准、重送 POST、drop schema 或 reset。若 disable 遭拒即精確回報，不換 route。

## 可重現的隔離驗證

```
node prototype/private-site/schema/build.mjs
node --test prototype/private-site/schema/contract.test.mjs
node prototype/internal-rc/native-http-regression.mjs --mode growth-os-native-regression --schema-candidate
```

第三行需預裝 pinned images 和 Chromium；本機可明設 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`。所有 SQL、Auth admin fixture seed、短 JWT、activation、失敗注入與後續清理只在此次 label-owned local containers；business builder 不依賴 `native-checks.mjs`／`ui-fixture.mjs`。瀏覽器的固定 backend origin 由 route guard 完整轉交本次 native HTTP，其他 origin 拒絕，沒有 hosted fallback。UI 使用已接受 URL payload import 聚焦 schema Save/Review；不宣稱重驗 scanner、WordPress、email OTP 或 magic link。

Native checks 包含關閉 default preflight、transaction rollback、重套拒絕、catalog ACL、future table probe、owner/viewer/foreign/deleted identity、直接寫入/TRUNCATE/anonymous拒絕、exact replay／changed replay／stale／duplicate Review、缺 legacy RPC、Save→logout→fresh native JWT→readback/Review。1280/390 各一次 lost Save 和 Review reply，先 commit 再中斷 response，確認 UI 只 GET reconciliation；新 context/token 取回 exact payload/review，viewer 無寫入。

官方權限依據：[Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)（grants 與 RLS 分層、函式 EXECUTE）；[PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)（global/per-schema defaults 疊加，既有物件 ACL 不受 default 修改影響）。
