# 單站 Node host 啟動與 HTTP 生命週期

最新派工基準 PR22 `dc2ec8b6641df1fd0639bf671e7099bfececd479`，父確認 Reviewer `01a10b50` APPROVE_WITH_DEFERRED_DEBT。branch `feat/single-site-node-host`，獨立 stacked Draft PR base `feat/gsc-native-date-contract`；PR19–22不切換／修改／合併。起始工作區乾淨，最新 Core authority 已核，沒有套用歷史6663／PR19指令。

## 結果與界線

Before：單站 service 可由測試 route 呼叫，但沒有自己的 Node HTTP executable。After：`node prototype/wordpress-pilot/runtime.mjs /absolute/private/host.json` 可啟動固定單站 publication HTTP listener，接回原 service、Auth/member、exact Review、CSV/journal。缺 config／disabled／格式錯／秘密檔或 store 不私有／binding不符／writer.lock已存在均拒絕，沒有初始化缺檔、續 grant、偷偷移鎖或替代身份。

`host.example.json` 預設 closed；實際設定與 WordPress credential 都是 server-only 絕對路徑，owner-owned、0600、不可symlink/hardlink，config≤64KiB。store目錄0700、journal0600，同UID，既有32MiB journal上限與fsync/rename保留。正式入口只接受owner_site；isolated_fixture、IPC傳輸與clock/fault control只在explicit test child entry，沒有從正式runtime import進去，Vercel output亦不帶fixture。

真 HTTP listen限`127.0.0.1`明確port。固定7個publication action，精確Host／Origin，無query、無absolute target、duplicate header拒絕；Bearer每次由原authority核對，cookie／forwarded header不替代身份。POST只接受JSON，普通body≤4096 bytes、measurement≤2100000 bytes，headers≤16KiB、最多32 connections；body讀取5秒、headers10秒、requestTimeout 15秒（接收完整 request 的期限，不是 handler／整段上游工作的總期限），上游HTTPS每call10秒及3MB response cap，不跟redirect。錯誤／health／readiness不回secret、path、grant、tenant或journal內容。health/readiness只證明listener及本機journal未進入uncertain狀態，不等於上游可用或發布授權有效。

SIGTERM／SIGINT停止新接單，最多30秒等進行中handler和socket都結束，成功才釋放writer.lock並exit0；超時關socket、保留lock並exit1。SIGKILL同樣留下lock，重啟fail closed。pending操作已由原publisher在POST前durable寫入；回應遺失仍unknown，不能因client斷線或重啟重送。沒有自動 crash unlock／多writer／host disaster recovery。

[Node24 HTTP文件](https://nodejs.org/docs/latest-v24.x/api/http.html#serverclosecallback) 區分停止接受連線與強制關閉既有socket。本入口把完整close納入共同期限，只有drain完成才釋放儲存鎖。

## Agentic Verification Loop

| 點位 | 適用性與實際證據 |
|---|---|
| PLAN／CODE | 適用；只補單站可啟動HTTP入口與生命周期，沿用原service、publisher、authority、journal；沒有新host框架／Auth／SQL schema。 |
| UNIT／CONTRACT | 適用；[contracts.log](evidence/Single_Site_Node_Host_2026-10-05/contracts.log)29/29包含原publisher／journal／fixture；最後[host-lifecycle.log](evidence/Single_Site_Node_Host_2026-10-05/host-lifecycle.log)11/11包含host/storage、真子process、Host／Origin／method／path／JSON／body／auth、脫敏、私有mode、排他writer、SIGTERM drain、SIGKILL及timeout lock、partial header socket、正式transport固定target/credential。最後transport test是stub fetch契約，未連真站。 |
| BUILD／RUN | 適用；原生Node24 ES modules，不需編譯。正式CLI missing/closed拒絕；explicit isolated子入口跑同一host/service並實際listen。原生PG六項鎖競爭不減assertions；正式import closure及現有deployed output均驗無bypass。 |
| BROWSER／DOM／1280＋390 | 適用；既有入口新增`--host`，UI publication請求經測試proxy呼叫真HTTP子process，沒有直接呼叫handler。UI無產品視覺改動；沿用截圖／no-overflow／44px鍵盤流程。 |
| DATABASE／AUTH | 適用；原SQL fixture與RLS、固定synthetic身份；原Auth/member/exactReview每次呼叫。真Auth issuance/JWT/OTP本輪NOT TESTED；無hostedDB操作。 |
| SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK | 適用；URL來源為隔離WordPress實際HTML→正常UI保存Review→publish unknown→service退出重啟→新browser/token讀回→GET核對→GSC保存→service再啟動→fresh session精確讀回→restore。之後短命HTTP driver與service均退出，新的driver、service、token再讀exact history/measurement；[1280 proof](evidence/Single_Site_Node_Host_2026-10-05/1280-host-proof.json)與[390 proof](evidence/Single_Site_Node_Host_2026-10-05/390-host-proof.json)記PID及比較結果。 |
| TENANT／PERMISSION | 適用；原viewer/foreign/錯頁/口徑拒絕，journal／SQL零差異；WordPress仍2POST。write到期無新保存、read lease到期拒絕GET核對但history可讀，backup還原新目錄只讀。 |
| VERIFY | [e2e.log](evidence/Single_Site_Node_Host_2026-10-05/e2e.log)兩尺寸完成及cleanup。CI新增host契約／HTTP E2E，同時保留原WP／pilot／GSC流程；exact HEAD CI/Preview另核交既有Reviewer，Primary不自行APPROVE。 |

重現：`node --test prototype/wordpress-pilot/host.test.mjs prototype/wordpress-pilot/store.test.mjs`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791 --host`。CI使用已安裝Chromium，不需本機path。會使用8791的fixture契約與E2E要依序執行；本機一次並跑發生EADDRINUSE，確認前者結束後順序重跑，未改port或降低斷言。另一測試修正是用原生HTTP client確實送出錯Host（Fetch未送覆寫Host），cleanup則先關service才刪fixture目錄；實際host判斷與資料安全斷言保留。

測試邊界：browser route仍提供靜態資產／Auth-SQL測試proxy，child的測試transport經IPC接回run內broker；真正publication入口是TCP HTTP及獨立process。driver/service退出後broker、SQL和WordPress仍存活，這是同run process生命周期證據，**不是所有基礎設施退出或真主機災復**。無外部GSC／live模型／新費用／持久grant。

## 供父選host的具體需求（尚未執行）

- Runtime：Linux POSIX、Node24、單replica／單writer，建議起始1 vCPU與512MiB RAM；這是容量預設，不是負載基準。目前root package的jsdom列在devDependencies但runtime需要它，部署候選以`npm ci --ignore-scripts`安裝完整lockfile依賴；不可`--omit=dev`後宣稱能啟動。不需Chromium、Docker或Python來跑publication host；它們只供回歸／原scanner獨立路徑。
- 啟動：固定read-only repo artifact；server-only host.json的service沿既有config格式，加listen_origin/public_origin/wordpress.origin/credential_file。credential JSON只含`binding,user,password`，binding必須全等service.binding；Auth使用既有publishable key與使用者Bearer，不用admin/service-role key。先在明確批准的setup中用既有`createStore(directory,binding)`建立私人目錄；runtime不自建。不把任何實值提交repo或放apps/web。
- 網路／TLS：同主機反向代理將唯一public origin的`/api/wordpress-publication/*`轉到127.0.0.1:8798，保留原Origin、將Host設為listener authority；host不信任X-Forwarded身份。TLS及憑證由proxy管理，外部不開Node port，無CORS跨域開放。只需要向已批准Auth/Data API與唯一WordPress origin的HTTPS egress。靜態UI、原backend與scanner是既有獨立路徑；新增host不取代它們，也未打開UI runtime flags。
- 儲存：獨占可fsync/atomic-rename的持久POSIX volume，建議1GiB，journal目前上限32MiB；提交暫存可再占32MiB。備份archive每份最多40MiB，7份約280MiB，加readonly recovery的source/journal約64MiB與餘裕。不能用ephemeral serverless filesystem或不保證排他建立／rename的object storage當journal。資料是頁面內容與觀測，需限制存取；權限不等於加密，volume/backup encryption方案另選。
- 備份：建議每次批准的發布／恢复／觀測批次後及每日備份，保留7日；這是待父確認的運維需求，未建立排程或跨run權限。先SIGTERM等exit0，再由同UID用現有`openStore(...).backup(newArchive)`，finally close；無HTTP backup endpoint。還原只能`restoreBackup(archive,newDirectory,binding)`到新readonly目錄；不覆蓋現journal、不移除crashlock。RPO取決於最後成功備份，未承諾RTO。
- 退出：proxy先停新請求，SIGTERM，給至少35秒supervisor grace讓內部30秒drain完成。exit1／SIGKILL／殘留lock先保留原目錄與journal、唯讀診斷；禁止auto-unlock或restart loop硬解鎖。歷史備份可另開readonly service，不恢復write授權。新的write/read grant、站點plugin/app-password、獨占編輯窗口仍須原批准。
- 成本：未選供應商／建立資源。父需一併核host固定月費、1GiB持久volume、7日backup、TLS/proxy、egress、既有Auth/WordPress成本，才能給完整報價；不宣稱免費。實际主機、secret存放、長期volume、backup job與任何新費用均另批。

## Deferred debt

P3：真主機／TLSproxy／長期secret與grant／運維backup／任意WordPress主題plugin相容性未驗。位置為runtime部署及既有pilot接線；影響正式啟用，未阻塞本run startup/HTTP契約，暫以closed config及固定隔離scope防誤用。觸發條件為父選最小host並核准完整成本與操作envelope；追蹤待Dot指派。負載、rotation、跨主機災復與多站不是本Core，沒有擴修。
