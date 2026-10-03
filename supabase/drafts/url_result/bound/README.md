# URL 待審成果：固定範圍離線驗收候選包

最新重綁包：[2026-10-03 09:30 UTC](owner-candidate-20261003T093000Z/README.md)。父轉述 Owner 已於08:53:10 UTC批准同範圍新截止，尚待父獨立驗包及安全 preflight；本輪僅離線生成，actual flags仍false/null。08:00過期包及下方既有紀錄保留為歷史。

本包依 Owner 2026-10-03 05:14 離線設計批准及父 06:11 派工準備，沿已驗收 `7467fa2227e39be6e095dd39da8c9b58ca780257`。不是遠端執行授權。沒有 remote DDL／ACL／查詢、登入、POST、模型或費用操作；04:01 closed 部署是已完成且過期的歷史批准。`apps/web` 與 prototype 的 schema/save flag 仍為 false，trial 為 null。此目錄不在自動 migration 路徑，也不在靜態站點根目錄。

## 固定輸入

`manifest.json` 與 `synthetic-export.json` 是唯一凍結輸入；fixture 已在離線生成，不重新取得 URL 或呼叫模型。

| 欄位 | 固定值 |
|---|---|
| actor | `e85f1a90-3565-4fc1-a7e0-3b7d08830d0e` |
| organization | `93a88055-0a0b-40c0-b22f-a6d312320001` |
| 新 parent | `9bafbb2f-eea7-48ea-bc23-3896897f19c3` |
| request | `4d602b3f-272f-4282-9906-b0cc0155e1c7` |
| expected version | `0` |
| export 檔案 SHA256 | `56ea3d35c799f63eb780aa7e1b2b1b6e850a96a4ead6ac913e479fc506cae424` |
| canonical payload SHA256 | `5fd32cb8424a2efe1dfa3f93ba251d0637d34fcd6e77d2b21c342ffb8ed86241` |
| source digest | `sha256:8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056` |
| review content digest | `sha256:567d484e3ce732527be30b7c0093ec5ebd0763f6ac446d3366c1524f423214d0` |
| PG request digest | `pg-jsonb-sha256:4cc5a9523bbccf6f0d976ce08b78ed3b7763cd69d18ee7bf34b00310e5f5f7a5` |

舊批准 parent `a6f7775d-501f-45e6-b15e-6e8d74a26c09` 不可替用。上限是新增 1 parent／1 version／1 audit。相同 request 的精確重送在 SQL 層僅回同 UUID；不同 actor、org、parent、request、payload 或 append 全部拒絕。

## UTC／Preview 待綁定

`generate.mjs` 是純離線 renderer，必須顯式傳入絕對 UTC 與既有 HTTPS branch alias 的 `/workspace.html`；拒絕省略 UTC、無效日期、query/hash/userinfo，沒有預設 window 或執行時 `now()+duration`。

```sh
node supabase/drafts/url_result/bound/generate.mjs "$APPROVED_ABSOLUTE_UTC" "$APPROVED_EXISTING_WORKSPACE_URL" /tmp/reviewed-url-bound
```

以上兩個值本輪未決定、未獲批准。生成後須重新審查具體 SQL／config 與 `hashes.json`，父再向 Owner 提出精確的遠端範圍。既有 callback 是否已允許該 `/workspace.html` 由父另行核對；本包不新增 account／org／membership，不改 callback 或登入設定。

`offline-candidate/` 使用固定 **2099-01-01T00:00:00.000Z** 及 **https://offline.invalid/workspace.html**，僅作可重現的測試樣本，絕不可直接當真實開窗值。該目錄開啟 flag 的 config 只是待審檔，未複製到 served root。實際 UTC／URL 變更會改 opening 與 config hashes，不能沿用本樣本 hash 作遠端批准。

## 兩份 migration 候選與 UI

1. `opening.sql`：單一 DO block，要求 19 筆 history 及既有 `20261003040602` closed marker，並確認新 parent/request 尚不存在。包含既有 URL schema／legacy guards，僅在既有 `private.save_url_result_draft_impl` 加固定 actor/org/owner、IDs、expected 0、PG request hash 與絕對截止時間。入口、org lock 後、membership lock/recheck 後、parent lock 後、每次 insert 前、idempotent 與新版本 return 前均查 `clock_timestamp()`。任一失敗回滾三筆資料。
2. 僅向 authenticated 授予現有 public/private URL Save 兩個 entry 的 EXECUTE；不額外授予 digest／trigger helper，不開 table INSERT。實測用 `SET ROLE authenticated` 呼叫 public RPC；postgres 僅建立 fixture／查觀察值，沒有用 postgres 呼叫冒充授權證據。
3. `cleanup.sql`：撤銷兩個 entry 對 PUBLIC／anon／authenticated／service_role 的權限並驗 effective ACL。保留 bounded function body、schema、凍結 payload 與既有資料，不還原通用 Save。到期本身不撤 ACL，cleanup 仍必要；SQL 硬截止使未 cleanup 時仍不能保存。
4. 候選 UI config 綁同一組 ID/hash/UTC/URL。既有登入完成後先 GET 固定 org/request，已存在即完整唯讀回復，無自動 POST；未存在才允許固定 export 首次確認。Save 前重驗 actor/org/owner、target、payload 與 deadline。known UUID 必須同一 UUID，完整 payload、digest、creator、version 1/draft 一致才接受。未知結果只 GET，不換 request、不重送。
5. `preview-closed-config.mjs` 保留 schema/read 能力而關 Save。實際分支 config 本輪仍全部 false/null，待另行批准才套用候選設定。

限定同源、同一受控 tab 的 sessionStorage 防重送標記：單一固定 key 僅存 org／parent／request／expiry／workspace URL／request digest scope、attempted 與已知 version UUID，沒有 payload、來源內容、token、個資或登入資訊。首次進入先確認 storage 可寫可讀；每次 POST 前同步寫 attempted=true 並讀回確認，失敗即不 dispatch。RPC 回傳 UUID 或精確 GET 成功時寫回 known UUID。full reload／同 tab logout/relogin 先讀標記再 GET；attempted 後即使 GET 一直空，也不再匯入或 POST；known UUID 不符時拒絕。錯 scope、損壞、不可用、寫入無效、初始化後標記消失／倒退均 fail closed；登出、cleanup、到期均不清標記。

此標記只限本次 bounded 驗收，未建通用成果 store 或跨裝置 DB claim。新 tab／新裝置／人為清除瀏覽器資料無法證明過往嘗試，因此不宣稱全球一次 HTTP；父仍使用同一受控 tab 並遵守一次 POST 預算。SQL 固定 request／鎖／唯一性維持資料最多 1／1／1，與 UI 防重送是分別驗證的限制。

## 離線證據（本機 2026-10-03）

- 28 tests、0 fail／skip：workspace API/mirror、URL API、bound API、bound SQL、native readiness regression。SQL 驗 19-record synthetic history baseline、錯 actor/org/parent/request/expected/null/角色/payload、到期拒絕初次與 replay、慢 audit 穿越截止後全回滾、真正 authenticated role、完整回讀與 foreign RLS 不可見。所有 20 個 business table 投影及 2 個 private ledger 排除唯一三筆新增後不變；cleanup 關 effective ACL、資料可讀、synthetic history 模擬 19→20→21。
- Chromium **151.0.7922.173**，1280／390 bound E2E PASS：先 GET、錯 export 拒絕、到期 0 POST、固定 IDs 的唯一 POST、commit 後 HTTP unknown→空 GET→成功 GET、fresh module 唯讀回復、cleanup 後同 payload 可讀與 1／1／1。
- 同瀏覽器 1280／390 原 URL Review→handoff/import→Save→readback E2E PASS；原 12 項取消／edit／refresh／pagehide／known UUID races PASS。修正 bound 模式在初次 GET 完成後才送 handoff-ready，避免把交接送進 busy 狀態。
- PG17.6 runner 已加入 CI：固定 digest 跨引擎、獨立 backend PID/blocking 證據、org/membership lock 等待跨 literal deadline→0/0/0、同 request 競爭→1/1/1、cleanup ACL 關閉與讀回。**本機無既有指定 image，exit 2 BLOCKED，未 pull；本輪不得聲稱 native PASS。** 新 HEAD CI 的 PG17.6／Chromium145 與 Preview checks 尚待父獨立驗收。
- 本機與 CI 測試皆 synthetic；19 筆 history 為合成相容性 fixture，不是遠端 clone，也不證明 hosted migration runner atomicity。歷史 `first_result_save/closed-package.sql` 維持 52,447 bytes，SHA256 `6a711df72cdf5bd5700f7148aa98b1982ca1209c5b5fe2fdf48a3a1288275beb`。

本樣本 hashes：

| artifact | SHA256 |
|---|---|
| opening.sql | `a353f811b5977550fe9a43c7d9959d6c58d69330958406119cd9bb30d3b6aff2` |
| cleanup.sql | `2932e50569d486e8d4251f20ac8b9c30be1180068ba8b6a897abd8814eb5b80c` |
| preview-open-config.mjs | `175c60f00b7fdbddbb2c04ad8339e8e53292867fa9b4982bacb1580b68c34c69` |
| preview-closed-config.mjs | `6dd7d6b4cdcd7801c72aba65e0f29df604c3372f4fae86b23e0f464076fce407` |


## 同 tab reload/relogin 防重送修正

`6bab3bef` 的未知 POST 防重送原先只在 module memory，父靜態 review 提出 HOLD。本輪先於未修改產品碼時，以 1280／390 確定重現：unknown POST、固定 request GET 一直空、full reload 後重匯入可送第二 POST，兩 viewport 均 FAIL（本機 `/tmp/bound-marker-before.log`）。之後才加上述限定 metadata。

本輪 21 項 workspace／URL／bound API＋marker tests PASS；Chromium151 1280／390 各測 unknown POST 及 acknowledged UUID 後 GET 空兩種情況，full reload、同 tab logout/relogin、強制再次 import/click 仍僅 1 POST。另驗 wrong/corrupt/get-unavailable/set-unavailable/no-op storage、同步 dispatch 前已持久 attempted、known UUID 在任何成功 GET 前跨 reload 拒絕 B、cleanup＋expiry＋空 GET 不復活 Save。原 URL E2E 及 12 races 保留。SQL／generator／候選 hashes／closed flags 未改。

查詢 `6bab3bef` CI 的 GitHub API 回 Forbidden，未重試或 blind rerun；本輪新 HEAD CI 仍由父獨立查核。本機 PG17.6 缺 image 的既有 blocker 沒有消除，也沒有把未執行記 PASS。
