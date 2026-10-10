# R7 介紹保存接線 — 離線／隔離交審

基準 b83b1fbba4019b5736ff5448876d90c0463b728e。2026-10-10 Owner 批准新增費用 US$0、無新模型或原站修改的保存接線／隔離驗收。父回報 pilot 已 ACTIVE_HEALTHY、public tables 為空，僅有收回未來 table API defaults 的 migration；這不是工作區 schema 已存在的證據。本輪無 remote probe、schema/ACL/Data API/Auth 改動、真寫入、部署或新 credential。

## 已實作

- apps/web/intro-save.mjs：獨立 R7 static intro 契約，保留完整真 frame、source URL/version、candidate hash；拒絕改文、改來源、改回條。不偽造產品 report，不放寬 first-result-payload。
- workspace-api.mjs 以既有 verified session / request transport 接入 intro API；新開關預設 false，且只有新 pilot origin 可啟用，舊 staging 即使傳 true 仍禁止。原 runtime 不換 key、不假造新 runtime；遠端 Save/Review 仍關閉。
- workspace 的專用面板先讀回最新版本，再保存候選、獨立核對保存版本；不帶入私有核稿站的頁內確認當帳號批准。登入態改變／離頁清除顯示；重新登入必須從後端讀回。無 localStorage 保存成果。
- R7 原頁與獨立副本：成功提示移到按鈕旁，完成文字「已在本頁確認」，仍只限頁內；不暗示已保存。R7 JSON／candidate hash 不变。

## 待實現的後端介面（本輪只有可執行隔離 simulator，無 SQL migration）

GET intro_versions：org + source_version + candidate_hash 過濾，最新 version；row 包含 kind=r7_static_intro、id、organization_id、created_by、request_id、version、source_url、source_version、candidate_hash、frame、created_at、confirmation。

RPC save_r7_intro：p_organization_id、p_request_id、p_expected_version、p_candidate_hash、p_source_version、p_frame。返回新完整版本；舊版不覆寫，新版 confirmation=null。

RPC confirm_r7_intro：同上識別／hash 欄位，以 p_version_id 取代 p_frame；確認必須匹配當前最新版本。回傳 confirmation 的 version_id/version/candidate_hash/source_version/actor_id/request_id/confirmed_at。

服務端必須以驗證過的登入身分＋Owner membership 授權，不能信任 client actor；按 org 與固定 R7 source 分區鎖定預期版號、原子追加，request_id 去重，保留不可改 audit（actor、org、request、version、時間、action），不可讓匿名或其他 tenant 讀寫。Client validator 不替代 RLS/ACL 或服務端 payload/hash 驗證。返回資料與精確再讀回不符即 fail closed。寫入結果未知時只以原 request 核對，不重送；新登入讀最新版本，仍不能推定未知 request 成功。

## 已驗證及界線

node --test prototype/intro-trial/r7-save.test.mjs：7 PASS。測試實際 workspace API 的 default/舊project/viewer 拒絕、精確 frame/audit、獨立 client 模擬再登入讀回、跨 tenant 拒絕、版本失效、修改內容拒絕、保存及確認提交後斷線不重送、corrupt readback、session race、兩個 client 競爭同版號。

PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/intro-trial/r7-save.e2e.mjs：1280/390 PASS，真 DOM 面板＋in-memory server simulator，保存/確認/登出/獨立 client 再登入讀回。Browser 僅 loopback GET；無真 Supabase Auth、SQL、RLS、跨裝置或 live backend PASS。

原 R7 contract 6 PASS；delivery/r7-private/verify.mjs 1280/390 PASS（hash、確認/複製、刷新/導航失效、資料竄改拒絕、近端提示、完成按鈕、無POST/外連/storage）；既有 typed-draft-ui.e2e.mjs 1280/390 PASS。私有副本只改必要 UX，不加保存 API；發布須由父端另行處理。

PLAN/CODE/UNIT/RUN/DOM/DESKTOP/MOBILE 已驗；buildless；SAVE/LOGOUT/FRESH CLIENT/LOGIN/READBACK/TENANT 為 simulator 層，不是 SQL/Auth 真驗收；沒有跨裝置實測。無新增套件、DB、secret、費用或模型呼叫。CI 隨 exact commit 查核，不能預先宣稱成功；交原 Reviewer。

## 下一步最小遠端依賴（不是本輪執行授權）

pilot 空 schema，不能只 flip flag：先完成本契約的最小實際服務端／SQL 與隔離權限驗收；只需介紹版本、確認 audit 與必要既有身份歸屬，不部署整套 workspace tables。核實 Free 方案/費用保持 US$0、既有 Auth user/membership 可用性與授權；批准後才配置這些受限表/RPC 的 Data API ACL/RLS、正確 pilot runtime/CSP/callback。不得沿用舊 staging 身分或 key；不得為配合目前完整 workspace dashboard 擴建整套產品。若 empty pilot 無相容 workspace，下一包將啟用入口縮為同一工作區的專用 R7 保存入口，先隔離驗收，不新增通用平台。

最後才允許一個明確 Owner/org/R7 hash 的真保存＋重新登入精確讀回，以及必要否定 tenant 驗收；未完成前開關維持 false。這次保存批准不包括正式網站內容發布。
