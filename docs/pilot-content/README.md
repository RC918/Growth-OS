# 單站真內容試點：核稿包

三份草稿尚未公開：[產品介紹](growth-os.md)、[關於／試點說明](about.md)、[隱私說明待核草稿](privacy.md)。僅產品介紹為候選改善頁；另外兩頁是不可寫控制頁。隱私說明的缺口不能靠 repo 推定，公開前需核對實際配置與 Owner 事實。

## 候選部署需要哪些東西

本 PR 只交付離線工程候選，不建立任何以下資源。

1. Owner 控制的 WordPress 網站：固定 HTTPS 網域、頁面 ID／完整 canonical URL、標題／`growth_meta_description`／內容三欄，以及可提供唯一 page identity 的模板。須先核是否允許安裝候選 MU plugin、Application Passwords、REST edit context 與單頁角色限制。WordPress.com Personal 僅是待測候選，尚未證實符合上述條件，不承諾相容性或價格。
2. 獨立 publisher server：支援 Node 與既有 jsdom、workspace Auth／Data API，提供同源受驗證的 `/api/wordpress-publication/{action}`。`createPilotService().handle(Request)` 是可測入口；此 PR 無託管啟動器、帳號、DNS、TLS、hosted deployment 或外部網路授權。不能把它放進無持久磁碟的短命 function 後宣稱證據持久。
3. 私有持久磁碟及備份位置：單 process／單 writer，0600 journal、0700目錄，備份有完整原文與發布紀錄，僅授權管理者可讀。容量上限32MiB；需要主機側備份排程、保存期限及復原責任人另核。本 PR 提供明確 backup/restore 函式，不新增排程。SHA256 是完整性核對，不是抗有權操作者竄改、回滾或外部公證。
4. 明確一次試點批准：固定 pilot/org/page/url、開始及到期時間，寫入一次發布＋一次恢復。讀回授權獨立到期；過期不更新、不自動取得任何新憑證。服務只接收 server 配置，browser 不能指定 grant、URL、欄位或 secret。WordPress plugin 另限制 dedicated user 的 REST target／三欄及生命週期最多2次 POST attempt；錯誤也消耗，不自動重設 counter。Application Password 本身並不是 page-scoped。
5. 目標頁獨占編輯窗口：預覽至恢復間不得有其他管理者／插件／背景程序寫入該頁。WordPress 管理者能繞過 plugin，現有 revision precondition 不提供跨所有 WP writer 的資料庫原子鎖；未能安排獨占窗口，不啟用。其他頁保持控制頁只讀。
6. 真資料量測：此增量明確顯示未知、拒絕 pilot measurement writes。後续增量需接 GSC `America/Los_Angeles` 日期、DST、完整日／缺日與精確 page／filter／來源契約；每日資料不能改標 UTC，也不能從每日總量還原精確 UTC 日。索引、曝光、點擊、到站訪問分開，未取得數據不得補零或主張效果。

## 備份／恢復與意外中止

`createStore(path,binding)` 只建全新 store；`createPilotService` 僅開現有 store，不能在缺失時默默重建而重置提交額度。`service.backup(newArchivePath)` 不含密碼、token或 grant。`restoreBackup(archive,newDirectory,binding)` 保留來源 snapshot，產出永久標記的只讀 journal。恢復後仍須原 workspace 的現行 Owner 身份、確切版與 Review 綁定才能讀歷史，不得恢復寫入／pending preview；可讀歷史不代表目前網站仍相同。

正常關閉可由新 process 開啟原 store。crash lock 會保留並阻擋第二 writer，不自動刪除；服務完整崩潰時須由操作者先確認舊 process 已退出、核對原 journal／`.next` 及 WordPress 原 operation，再決定另批維運。沒有自動 stale-lock 修復或 hosted 災難復原主張。可先將已完成備份恢復至新只讀位置；這不解鎖原寫入服務。

若只是網路回應遺失且 store 仍健康，服務保存 unknown，原 operation 可在獨立有效 read lease 內 GET-only 核對；write lease 到期不阻擋這項只讀核對。history 完全不呼叫 WordPress，write/read lease 均過期或憑證撤銷後仍核 workspace 身份再讀。
