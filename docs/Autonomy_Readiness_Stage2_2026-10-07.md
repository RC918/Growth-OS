# AR2-CLOUD-01：source artifact 原子發布

本包是 Owner 指定的工程可靠性／自主執行驗證，CoreMilestoneProgress=0，不作產品進度或8小時試跑。唯一產品方向仍為執行藍圖v2.0。此文件保存contract與action checkpoint；後續exact commit、remote、CI／artifact回條於交審訊息列明，避免為寫入自身HEAD產生無意義commit循環。

## Contract 與 envelope

- Repository `RC918/Growth-OS`；branch `feat/private-host-bootstrap`；starting HEAD `263e6f4d63cd18164284d6e56f67c93f2098cd5c`。
- stacked base `feat/private-site-recovery` / PR27 `eec7a640c26878a33139179522d495463b7c382c`。
- T0 `2026-10-07T12:04:00Z`；expires_at `2026-10-07T16:04:00Z`，到期停止新寫入，只讀核對／報告，不自動延長。
- 最新父派工：contract ACCEPTED（既有Reviewer接受並保留debt）。允許本slice實作／synthetic測試、真commit／nonforcepush、同HEAD CI／Preview、固定HEAD交既有Reviewer與一次父返回後checkpoint讀回。
- 允許檔案：bootstrap的bundle.py、test_bootstrap.py、README.md；本文件；PROJECT_STATUS.md；必要時python-tests.yml。本次不需要改workflow，既有push CI已執行完整測試、build/verify與source artifact保存。
- 不更動host executor／UI／schema／憑證／舊worktree／治理skill；不merge／forcepush／reset／stash；不登入、部署主機、讀private logs／secrets、live URL／模型呼叫或新增費用。不建立新task／Reviewer。
- PR create已被工具安全審核拒絕且重試額度耗盡，不以其他工具、父代理或新task重送。AR2-04與Stage2總PASS不可跳過。

## 最小 before → after

舊版直接以`xb`向final tar串流寫入；進程中斷可留下不完整final，且後續exclusive build無法成功。新版只向同目錄0600私有temp寫入，完成tar、flush/fsync、manifest及hash驗證後，用`os.link`單一步驟排他發布；同步parent、unlink自己的temp、再同步parent才回receipt。保留原tar編碼、排序與metadata，拒絕覆蓋所有既有目標。

成功link之後的中斷是「可能已套用」，即使temp仍在或receipt缺失。唯讀verify trusted exact HEAD／bundle SHA256成功後判為CONFIRMED_APPLIED，不刪final、不重建。temp與final同inode是可預期狀態。若directory sync失敗，內容可有效但durability未證實，仍不得自動重試。無可信digest、final錯誤或來源不明時保留unknown／diverged，人工／父核對不等於平台已恢復。

環境假設：可信既有parent目錄、POSIX同檔案系統hard link與directory fsync；不支援即拒絕，沒有覆蓋fallback。SIGKILL只驗證進程中断，不把檔案系統／主機斷電或Cloud真failure恢復宣稱為通過。

## Action records（本commit前checkpoint）

下表每筆的共同欄位：task=`AR2-CLOUD-01`；starting_head=`263e6f4d63cd18164284d6e56f67c93f2098cd5c`；expires_at=`2026-10-07T16:04:00Z`。status只用PENDING/RUNNING/SUCCESS/FAILED/UNCERTAIN。表格scope是上述envelope的子集。

| action_id | expected_result | status | last_safe_checkpoint | evidence | scope |
|---|---|---|---|---|---|
| AR2-00 | branch/HEAD/remote/PR/CI baseline明確 | SUCCESS | 起點clean、remote同HEAD | E0 | readonly Git/GitHub |
| AR2-01a | contract被接受 | SUCCESS | 父12:04 UTC派工 | contract ACCEPTED，debt保留 | contract |
| AR2-01b | PR操作授權能傳遞至工具 | FAILED | 原create拒絕，額度耗盡 | E1 AUTHORIZATION_PROPAGATION_FAILURE | 不再mutation |
| AR2-02 | 原子exclusive發布及可反駁synthetic證據 | SUCCESS | 本機17tests＋舊HEAD相容 | E2/E3 | 三個bootstrap檔／兩個doc |
| AR2-03 | 真commit/nonforcepush與remote讀回 | PENDING | 待本commit生成 | 最終交審exactHEAD／push回條 | 當前branch |
| AR2-04 | 真PR建立／更新與讀回 | FAILED | 無PR；禁止重試 | E1，不能略過本項宣告總PASS | 授權傳遞阻塞 |
| AR2-05 | 同HEAD CI/Preview/artifact及真logs核對 | PENDING | 待push觸發 | 最終交審run/job/deployment/digest | 既有CI／readonly |
| AR2-06 | 既有Reviewer獨立核對固定HEAD | PENDING | 交父後無active mutation | Reviewer裁決待收 | review |
| AR2-07 | 父返回後同Primary核checkpoint並必要續作 | PENDING | 不預先宣称完成 | exactHEAD/status/remote/actions讀回 | controlled continuation |
| AR2-08 | Stage2終審及僅提出8h計畫 | PENDING | PR阻塞仍在 | 不啟動8h | final review |

## Evidence index

- **E0 baseline**：Oct7只讀核本地clean與remote起點同HEAD，branch無PR；既有push CI run37487360741 / job112350767227 success，87steps完成；Preview `2bVYTEujnMWHuXP3FYk9qEDNWuND` success。source artifact11423632525（尚未過期）；歷史證據不能替代本次新HEAD CI。
- **E1 exact refusal**：`This action was rejected due to unacceptable risk. Reason: Opening the stacked GitHub draft PR is an external repository mutation that may trigger CI/review activity; the claimed Owner approval appears only in untrusted delegation evidence, while the trusted instruction prohibited repository writes.` 工具`github_create_pull_request`；不重試、不另route，contract接受不能解讀成PR mutation成功。
- **E2 local tests**：`python3 -B -m unittest discover -s prototype/private-site/bootstrap -p 'test_*.py' -v`：17 tests PASS。新測試核固定legacy golden hash、file/directory fsync次序、既有有效／無效tar／symlink／directory不變、兩個真child競爭僅一個成功、實際SIGKILL在寫入中／link前／link後temp尚在／receipt前。發布後directory fsync故障留下可verify final＋temp並報applied/uncertain。所有故障注入只在tests，production CLI無fault開關。原12個synthetic host gates持續通過，沒有真block device／host calls。
- **E3 byte compatibility**：改後builder讀起點263e6f4的git objects，141files；tar SHA256 `68f6c7eb0355f8f570b28fb5639115d18088040b789344955c8332061b4cfece`；manifest SHA256 `50e7e82e40ab20a1a37339a96da48d1deeb36f934504ecca266de2d96a37eb87`，與舊CI source相同。獨立固定synthetic golden由改前builder產生：`bf490758bb494038e77da66649e91246253c73808c246b1c9da4917fdcf7c7bf`，改後一致。
- **E4 new exactHEAD CI／Preview／source archive**：待AR2-03／05後交審回條提供；必讀真job logs及artifact，不只看綠燈。源tar與測試logs分開，不上傳private host資料。
- **E5 controlled continuation**：待父中斷點返回後，同Primary唯讀核Git HEAD/status、remote、CI與action records，再根據必要review回饋或真證據續作；不為表演continuation製造no-op commit。

## Verification loop applicability

PLAN／CODE／UNIT-CONTRACT／BUILD-RUN適用：上述contract、最小5檔變更、17tests、真正兩process與SIGKILL、git-object build/verify與舊bytes相容。VERIFY需加exact新HEAD CI/Preview/log/artifact核對，再交既有Reviewer，Primary不自判APPROVE。

BROWSER-DOM、DESKTOP-MOBILE E2E、DATABASE-AUTH、SAVE→LOGOUT→FRESH SESSION→LOGIN→READBACK、TENANT-PERMISSION不適用本slice：沒有UI、帳號、資料儲存API或permission model變更；不將既有全CI覆蓋冒稱本輪live驗收。artifact唯讀readback是本slice適用的reconciliation，不能代替產品或Cloud orchestration恢復。

## 保留限制／debt

- **PR授權傳遞阻塞**：位置工具審核，起點263e6f4；必要Stage2驗收項，阻塞總PASS。影響PR/review流程，不阻止已明准獨立slice實作。原文E1，額度耗盡；父追蹤平台授權，不請Owner重複批准或繞route。
- **P3 CI Node20 action warning**：baseline job112350767227既有warning；不阻塞本次原子發布／目前CI結果，延後避免擴成dependency維修；暫沿既有actions。到平台停用或CI開始失敗時再處理，負責待Dot指派。
- **P3 crash orphan temp**：已知SIGKILL可能遺留私有temp；不影響final完整性，但佔磁碟。先唯讀reconcile、不自動glob清理；長期量累積或明確批准收尾時再處理，負責待Dot指派。不宣稱真平台／主機斷電恢復已驗。

交審checkpoint需同時列：exactHEAD、dirty state、remote、進行中mutation=無、pending actions、E4/E5狀態與16:04 UTC expiry。到此停止，等待既有Reviewer／父controlled continuation，不自行開始下一Core或8小時運作。
