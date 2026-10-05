# 單站候選第一垂直增量（未部署）

## 現行授權及防誤讀核對

Owner 2026-10-05 06:56 同意 no-new-cost 工程與三頁草稿；父最新派工要求以 PR20 `fa2e7374b3fbf574368d11d35b643733d011e3ca` 為基底開獨立 stacked draft PR。當前 branch `feat/single-site-pilot-candidate` 起點與 GitHub PR20 head 完全相等。沒有切回舊分支、reset/stash/drop，也沒有移除 PR19 的 `/workspace/Growth-OS-rc-evidence` worktree。

曾因錯套最初 orchestration 的歷史 `6663b7f…` 指令而嘗試 checkout 舊分支，被既有 worktree 佔用擋下，未改檔即停。父明確更正後，只讀核對 HEAD／PR20 及最新派工，回到已批准 Core。root cause 是錯把歷史範圍當現行範圍；此記錄與每次 Core 開始讀「最新 Owner／派工→現行 branch／base→差異」為有界防誤讀，不新增 loader／治理修復工程。

## 可審使用者結果

原 publisher 證據受 run／短 grant 限制，HTML 又固定 `/bolt/`。候選沿用既有 publisher、journal、workspace Auth／membership／exact Review，新增 server-only 單 org／pilot／page／URL 綁定與短期 read/write grant 分離。每個 pilot 最多一次 publish、一次 restore attempt；WordPress 候選 plugin 獨立限制 REST 專用使用者、目標頁、三欄及最多2次生命週期寫入 attempt。

歷史讀取仍核當下 workspace Owner、版本與 Review 綁定，但不使用 WordPress grant／憑證／GET；歷史 v1 在 v2 存在後保留。backup 恢復到新目錄，只能讀歷史，不能恢復 writer 或 pending preview。正常 process 退出可重開，crash lock 留存阻擋第二 writer。原 operation unknown 僅以獨立有效 read lease GET 核對，write lease 到期不放行任何新寫入。

scope 為 `single_site_wordpress`，且本機 receipt 明記 `environment=isolated_fixture`；不將 Owner 真站 receipt 偽標 `isolated_wordpress`，也不把 synthetic WordPress 當真內容上線。UI 明示基線／後續／效果未知、拒絕 pilot measurement writes。GSC America/Los_Angeles／DST／coverage／unknown 完整日資料整合是父允許拆出的後續增量，本 PR 未實作或假報完成。

三頁草稿與待核部署需求見 [核稿包](pilot-content/README.md)。只有产品介紹列為改善頁；關於及隱私為控制頁。隱私草稿不具公開條件，未知配置不填成已啟用服務或合規承諾。

## Agentic Verification Loop

- PLAN／CODE：第一個可審 vertical increment；無新 framework/runtime dependencies、SQL／Auth 修改、hosted 資源或 grant。default deployed flags 仍 closed。PR19／20 不修改。
- UNIT／CONTRACT：`node --test prototype/wordpress-pilot/store.test.mjs prototype/wordpress-publish/publisher.test.mjs prototype/wordpress-publish/journal.test.mjs prototype/internal-rc/contract.test.mjs`，26/26 PASS。第二 process lock、乾淨新 process 精確讀回、備份 readonly、corrupt／partial／crash lock 不自修、closed config、既有 unknown／preserved-fields 及 candidate manifest。
- BUILD／RUN：直接執行 ES modules 與 Web Request handler；沒有額外產品編譯步驟。Preview 的 echo build 不代替 executable 驗證。
- BROWSER／DOM／1280＋390 E2E：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --pilot`。既有 UI／normal handoff、鍵盤 Enter／Space、44px控制項、無橫向溢出、三欄 diff、独立 publish／restore確認。
- DB／AUTH：沿用隔離 PGlite authenticated actor／RLS 與正式 workspace Auth/member/exact-version API contract；entry 另跑既有原生 PG17 的6組 lock／expiry 契約。沒有以 synthetic token 宣稱真 JWT／email OTP／hosted auth 驗證；Auth 程式未改，既有 native HTTP CI 是回歸證據。
- SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK：從實際 owned WP HTML 經 unchanged parser 產出、UI 編輯→normal handoff保存→關閉舊 context／退役 token→新 context／新 token→完整 payload 與 exact Review；發布回應遺失後 service 重開、新 session 依原 operation 只讀核對；恢復回應遺失後 write lease 到期仍 GET-only 核對。
- TENANT／PERMISSION：Owner以外 viewer／foreign的 history／preview／readback／restore 拒絕，完整 SQL／journal snapshot 零差異；原 UI SQL 拒絕例也核零 business/audit增量。WP 直接控制頁／額外欄位／第三 attempt 均403且 page/meta snapshot不變。每viewport只2個成功 WP POST（一次publish、一次restore），拒絕請求另計，未假報為零傳輸。
- 持久證據：原store重開、write到期、WPcredential撤銷後history精確讀回且WP GET0；只讀backuprestore精確history。Store單元另核實際新process讀回與SIGKILL鎖保留。UI服務重開是同runner重新建instance，不冒稱全託管process／磁碟災難復原。
- VERIFY：本機 logs／screenshots／非secret proof 隨證據目錄歸檔；提交後 CI／Preview 對完整 HEAD 另核，交既有 Reviewer，由父追蹤；Primary 不宣告 APPROVE。

## 限制與後續批准邊界

此候選沒有真正 WordPress hosting、publisher host啟動器、外部憑證或長期部署。handler 以隔離 browser route 餵入真 Web Request，WordPress 則是真 pinned container／HTTPS；不是 hosted publisher HTTP 可用性驗收。WordPress.com Personal 相容性未知，不代申請帳號、不收集 secret。主機需支援 MU plugin、Application Passwords、單 page角色限制、唯一HTML定位和純文字單段描述內容；現有插件/主題衝突尚未驗證。

必要部署前提：獨占目標頁編輯窗口。revision precondition 不等同能攔住所有 WordPress admin/plugin writer 的原子交易；有其他 writer 時不啟用。備份 SHA256 可檢損壞，不提供有權操作者回滾／竄改防護。crash lock 保留需人工離線核對才能另批寫入復原；未知結果永不自動重送。

未執行：真內容公开發布、真站 grant、GSC連接／真資料日期整合、索引或流量改善、hosted backup災復、Owner實際內容事實及隱私配置終核。這些不是由本機測試推定通過。凍結 SQL與歷史 RC artifacts 保持原bytes；只更新未批准的 build-only RC manifest，其批准窗口仍 null。

P3／P4：無本次額外擴修；沿用 PR20 upstream whitespace debt。crash自動接管／多writer／多CMS不在第一pilot架構，若後續主機需要，由 Dot 另選範圍，不在此 Core 擴建。
