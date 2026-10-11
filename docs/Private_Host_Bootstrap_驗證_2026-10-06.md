# Closed主機bootstrap離線交付

Base PR27 `eec7a640c26878a33139179522d495463b7c382c`，branch `feat/private-host-bootstrap`，stacked draft供既有Reviewer。使用者結果：Mac可拿獨立hash source artifact，依一次批准包與具體磁碟receipt建立closed主機基礎；不是private app已上線。

- PLAN/CODE：沿用PR24–27 gateway/host/Compose/systemd，不改產品行為。新增 `prototype/private-site/bootstrap` 的固定source bundle、NVMe preflight/format gate、UUID mount guard、closed單元與帳號初始化及runbook。無secret生成、DB/WP初始化或hosted grant。
- UNIT/CONTRACT：12個Python synthetic tests PASS：精確批准/期限/錯identity，簽名/partition/root/swap/holders，dry-run無mutation、第二次觀察變化拒絕，mock格式化無-F/erase，UUID/缺mount拒絕，receipt檔權限，所有serviceclosed/mountguard，synthetic filesystem完整install、重入拒絕，listener阻擋cleanup，bundle重現/逐檔tamper/HEAD/hash/path/既存extract拒絕。沒有真device、sudo、loopdevice或VM操作。
- BUILD/RUN：source builder從exact git objects打包，CI驗bundle/manifest並獨立upload，非evidence zip充作部署包。固定Node v24.19.0 Linux x64 archive實際下載核SHA `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647` 與官方SHASUMS一致；未宣稱驗release signature。artifact exact head/hash見PR交付receipt。
- Existing regression：`node --test prototype/private-site/gateway.test.mjs prototype/wordpress-pilot/host.test.mjs` 13/13 PASS，包括真本地child/HTTP/TLS/SIGTERM與store鎖。未手動重跑bounded RC，既有CI不刪減。
- BROWSER/DOM、desktop/mobile、DB/Auth、Save/logout/fresh-login/readback/tenant：此slice不修改UI或業務/Auth/SQL，無新增實機適用性；沿用PR27已審證據，不把synthetic bootstrap當hosted驗收。不要求Owner登入。
- VERIFY：本機diff check通過。exact commit CI/Preview與source artifact由交付時遠端receipt核對，未完成前不宣稱成功。交既有Reviewer，不merge、不自行APPROVE。

## 重要限制與停止

真disk stable mapping/signatures、package候選精確版本與signed來源、Machostkey信任、UTC窗口及OS寫入均待批准/實機preflight；格式化receipt是操作者對外部Owner批准的綁定，不是密碼學簽章。format互斥只涵蓋本工具，需無其他root操作者窗口。實機systemd/apt尚未跑，synthetic不能替代；partial install/unknown mkfs只讀reconcile，不重送/覆寫。收尾JSON不冒稱AWS關埠/reboot完成，父獨立負責。

正式SMTP/Auth/DataAPI/SQL、TLS信任/路由、secret provision、image pull/Compose up、WP真內容、journal/grants、hosted backup與publish全屬下一部署階段。source依賴沿用root lockfile；jsdom雖列devDependency却是publisher runtime import，故明列npm ci --ignore-scripts不omit dev，不新增npm依賴或browser安裝。舊README歷史xvdf/恢復未實作敘述不作本輪指令，最新bootstrap/recovery文件優先；不為修歷史敘述擴maintenance。
