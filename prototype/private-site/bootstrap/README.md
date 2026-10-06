# 私有主機 closed bootstrap（離線候選，不是部署批准）

基準 PR27 `eec7a640c26878a33139179522d495463b7c382c`。本 slice 只讓既有 Mac SSH 通道按核定 source bundle 建成 **無應用 listener、無秘密、無資料庫初始化、無開機自啟動** 的基礎。唯一目標 `growth-os-pilot-vm`，Ubuntu24.04 x86_64；8GiB 資料碟需重新實測身份。不能將 API `/dev/xvdf` 或 guest `/dev/nvme1n1` 當固定 identity。

這是特定單機的命令清單與小型 gate，不是通用部署器。Mac 負責執行核定 artifact；本 Cloud 是唯一工程寫入者。不得把 Cloud 私鑰搬至 Mac。本文中的命令全屬**未執行的實機程序**；本輪只測 synthetic。

## 一次批准範圍與停止條件

Owner 同包核定：source HEAD/bundle/manifest SHA256、主機與 host-key 信任起點、Mac來源 /32、最多2小時 UTC窗口、必要官方套件及精確解析版本、指定 `/opt`/`/etc`/`/srv` 路徑與服務帳號、磁碟格式化與 mount、父獨立關埠+reboot。操作者將批准 reference 填入 receipt，receipt 自身不是授權簽章；不得自行把 `owner_confirmed_mapping_and_discard` 改成 true。父保留可信批准與 receipt SHA256，Mac 核同一份。

破壞性格式化保留一個即時 checkpoint：提供真 disk ARN、by-id、serial、resolved path、容量、machine hash、signature/children/mounts/holders 全部結果，Owner 明確確認 mapping 與可丟棄此磁碟。無 signature 不證明全盤無舊資料。未知、錯誤、映射不能證實即停止；不 force/reset/erase、不從容量猜碟。

不得在本窗口做 Supabase SQL/DataAPI/Auth/SMTP、DNS、TLS trust安裝、bucket grant、image pull/compose up、WP安裝或秘密生成。費用僅現有資源；不建服務/排程/SSM。sudo僅批准下列程序。主機有既有安裝／帳號／配置衝突時停止，不自動移除或覆蓋。

## 1. 固定 source artifact 與官方 runtime

CI獨立 `private-host-bootstrap-source` artifact 內包含 source.tar 與 receipt.json；它不是 CI screenshots/evidence 包。CI PR workflow可能用 merge SHA，部署只接受 push workflow的 exact reviewed branch HEAD。`bundle.py` 從 git object讀，排除工作目錄、node_modules、秘密、舊RC資料與docs/evidence；僅收錄明列 runtime目錄及被publisher正式重用的 `internal-rc/authority.mjs`。目錄內保留測試來源便於稽核，**不得執行fixture**。bundle有逐檔hash/size/mode，tar固定排序/時間；驗證拒絕額外、缺漏、link、traversal、錯HEAD、錯hash。外部批准的bundle digest才是信任起點，內附manifest不是簽章。

在乾淨 exact commit checkout 產製（CI已執行同命令）：

```sh
HEAD=$(git rev-parse HEAD)
python3 -B prototype/private-site/bootstrap/bundle.py build --head "$HEAD" --file /tmp/source.tar > /tmp/source-receipt.json
```

Mac先核 artifact receipt與父的可信hash，傳至VM的私有 staging目錄；透過已審核 `bundle.py` 再驗，先核該 verifier本身與審核來源同hash。Owner另准後才extract，新目的地必須不存在：

```sh
python3 -B bundle.py verify --head "$APPROVED_HEAD" --file source.tar --sha256 "$APPROVED_BUNDLE_SHA256"
sudo python3 -B bundle.py verify --head "$APPROVED_HEAD" --file source.tar --sha256 "$APPROVED_BUNDLE_SHA256" --extract /opt/growth-os
```

批准的 readonly前置：`cat /etc/os-release; uname -m; id; sudo -n true; df -B1 / /var; date -u`；需 Ubuntu24.04/x86_64。`/opt/growth-os`與`/opt/growth-node`既存即停。Node固定 v24.19.0，官方SHA已讀取並釘在 `artifacts.json`，本輪另下載實際Linux x64 archive核SHA一致；不是獨立驗過release簽章。

套件操作前先核既有 apt sources／package policy，只有Ubuntu Noble官方archive與Docker官方Noble amd64來源可用；代理或mirror需另列可驗來源，不默認可信。無現成curl/CA時先從Ubuntu簽名索引安裝固定candidate版 `ca-certificates curl`。若需新增Docker apt來源，使用 [官方apt步驟](https://docs.docker.com/engine/install/ubuntu/#install-using-the-apt-repository)：獨立 `/etc/apt/keyrings/docker.asc`、`docker.sources`，Signed-By、noble、amd64，不覆蓋既有檔，不curl管線執行shell。執行 apt update 是明列主機寫入，僅批准後。

列出 `artifacts.json` 指定的6個Ubuntu與5個Docker package的 `apt-cache policy`，把實際candidate `name=version` 存成核定 `packages.lock`，核signed來源及 `apt-get --simulate install` 的新增/移除/容量清單。沒有移除/升級既有非必要package批准；有衝突即停。把精確lock/hash作為同包預檢receipt，**不使用latest fallback**。套件安裝前暫時mask未存在/未使用的Docker單元以防auto-start，安裝後stop+disable再解除runtime mask；不可mask既有工作負載。

```sh
# packages.lock只允許11個核定name=version項；由操作者核對，不把聊天文字當shell。
mapfile -t PACKAGES < packages.lock
sudo systemctl mask --runtime docker.service docker.socket containerd.service
sudo apt-get install --no-install-recommends "${PACKAGES[@]}"
sudo systemctl disable --now docker.service docker.socket containerd.service
sudo systemctl unmask --runtime docker.service docker.socket containerd.service
# 核三單元inactive/disabled；安裝失敗同樣走stop/disable清理，不跳到後段。
```

Node（命令在批准窗口內執行，staging無其他人可寫）：

```sh
curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz -o node-v24.19.0-linux-x64.tar.xz
printf '%s  %s\n' 14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647 node-v24.19.0-linux-x64.tar.xz | sha256sum -c -
sudo mkdir -m 0755 /opt/growth-node
sudo tar -xJf node-v24.19.0-linux-x64.tar.xz -C /opt/growth-node --no-same-owner
/opt/growth-node/node-v24.19.0-linux-x64/bin/node --version
cd /opt/growth-os
sudo env PATH=/opt/growth-node/node-v24.19.0-linux-x64/bin:/usr/bin:/bin /opt/growth-node/node-v24.19.0-linux-x64/bin/npm ci --ignore-scripts --no-audit --no-fund
```

沿用已有package-lock完整依賴；publisher正式import jsdom，目前它在root devDependencies，不能 `--omit=dev`。不下載Playwright browser、不跑npm lifecycle或fixture。runbook的所有配置更動先查重，失敗保留狀態不整包重跑。Docker images下載/啟動留下一階段；Compose原固定digest不變。

## 2. 磁碟預檢、精確format receipt、UUID mount

Mac唯讀列 `lsblk -b -o NAME,PATH,TYPE,SIZE,SERIAL,FSTYPE,UUID,MOUNTPOINTS`、`ls -l /dev/disk/by-id`，父提供fresh AWS disk ARN/attachment/serial mapping。by-id須是整顆NVMe且不可使用partition alias。`inspect`實際讀lsblk、wipefs --no-act、blkid -p、holders與machine-id digest：

```sh
sudo python3 -B /opt/growth-os/prototype/private-site/bootstrap/bootstrap.py inspect --by-id "$ACTUAL_DISK_BY_ID" > disk-observation.json
```

只接受8GiB整碟、無partition/簽名/掛載/swap/holders；工具失敗亦拒絕。輸出非秘密JSON，失敗status STOP。格式化receipt必須是root owned0600無link檔，內容如下（**placeholder不是批准**）：

```json
{
  "action": "format-single-ext4-disk",
  "instance": "growth-os-pilot-vm",
  "approval_reference": "OWNER-EXACT-CONFIRMATION",
  "starts_at": "ACTUAL-UTC",
  "expires_at": "ACTUAL-UTC-NO-MORE-THAN-2H",
  "aws_disk_arn": "ACTUAL-AWS-DISK-ARN",
  "owner_confirmed_mapping_and_discard": false,
  "by_id": "ACTUAL-BY-ID",
  "serial": "ACTUAL-SERIAL",
  "snapshot_sha256": "ACTUAL-OBSERVATION-DIGEST"
}
```

核root0600receipt與父保存hash；先dry-run，Owner具體批准後才apply：

```sh
sudo python3 -B /opt/growth-os/prototype/private-site/bootstrap/bootstrap.py format --receipt /root/growth-format-approval.json
sudo python3 -B /opt/growth-os/prototype/private-site/bootstrap/bootstrap.py format --receipt /root/growth-format-approval.json --apply > format-result.json
```

apply持有本工具互斥lock、再次live觀察與receipt比對後才 `mkfs.ext4 -L growth-private <resolved-device>`，沒有-F／erase／fallback。操作要求同一窗口無其他disk操作者；lock不能防其他root程式。結果 `FORMATTED_NOT_MOUNTED` 含UUID。失聯或格式化後receipt失敗視為unknown，先blkid/唯讀核對，絕不重送mkfs。

批准新UUID掛載後，先確認 `/srv/growth-private` 不存在且fstab無同UUID/目標entry，保存fstab原檔為窗口專用備份（不覆蓋）。追加**一筆**核對過的 `UUID=<actual> /srv/growth-private ext4 defaults,nodev,nosuid 0 2`，不使用nofail。此entry缺碟可能影響開機；Owner須接受，父不得為恢復連線自行格式化。執行：

```sh
sudo mkdir -m 0755 /srv/growth-private
sudo mount /srv/growth-private
```

若Owner選擇避免boot等待，可只手動UUID mount、不寫fstab；仍不能enable應用，重啟後缺mount時guard會拒絕。不默認更改選項。所有情況要把實際 `{ "uuid": "...", "by_id": "...", "serial": "..." }` 放入下階段receipt。mount-check要求findmnt精確mountpoint、ext4/rw、UUID、by-id source與serial一致；不得拿root filesystem下同名目錄代替。

## 3. Closed服務初始化（不啟動Compose／不生成秘密）

root0600 `/root/growth-install-approval.json` 包含 `action=install-closed-bootstrap`、instance、approval_reference、starts_at/expires_at（≤2h）、inspect的machine_sha256、核定source head/manifest_sha256、mount物件。獨立實際批准此安裝；不能沿用format action。執行：

```sh
sudo python3 -B /opt/growth-os/prototype/private-site/bootstrap/bootstrap.py install-closed --receipt /root/growth-install-approval.json > install-result.json
```

helper先核目前主機／期限／UUIDmount／逐檔sourcehash／Node版／既有account和unit衝突；建立兩個system nologin帳號、各自0700 source/publisher目錄，且不建立journal/DB。WP/MariaDB資料目錄留空缺席，待下一階段核image UID後才建。從原templates衍生units，只加RequiresMountsFor、每次啟動前UUID/identity檢查、closed marker條件及固定Node路徑；無Install、自動restart或start。只daemon-reload，核全部inactive且非enabled。`/etc/growth-private/bootstrap.closed` 永久擋住此slice的應用啟動；刪marker不屬本包授權。mount.json非秘密0644供service檢查，root控制；publisher/TLS/DB secret檔必須不存在。

機器可讀結果為 `CLOSED`、head/manifest/UUID、各單元state、secrets_created=false；target active不算成功。JSON gate提供artifact與操作相符證據，不能取代Owner授權或主機實測。既有account／partial install／錯hash直接STOP，不覆蓋補跑。

## 4. 收尾與失敗退出

窗口末20分鐘不開新變更。Mac在既有批准scope內stop本包單元（本slice本來應inactive），停Docker三單元，核沒有application listener，保存結果：

```sh
sudo systemctl stop growth-private.target growth-gateway.service growth-publication.service growth-source.service growth-wordpress.service
sudo systemctl stop docker.service docker.socket containerd.service
sudo python3 -B /opt/growth-os/prototype/private-site/bootstrap/bootstrap.py closed-status > cleanup-result.json
sudo ss -lntp
```

未完成安裝時不要因找不到units改報PASS；記停止點、已套用項、下一個唯讀核對。不刪資料、lock、帳號、source、mount、OS套件或現有default key，不down-v/prune。批准後可刪此次staging的下載重複檔，不宣稱secure erase。Mac結束SSH；父獨立close臨時TCP22規則、核ports空，再reboot等待terminal succeeded。API關埠不等於既存連線已斷；重啟是本包批准的退出手段，應用不enable故不自起。Mac失聯亦由父關埠/重啟，helper不持AWS憑證、cleanup JSON明列PARENT_API_REQUIRED而不捏造已完成。

下階段才是真SMTP/Auth/DataAPI/schema、TLS與private origins、DB/WP secrets和初始化、publisher journal/grants、private app驗收、hosted備份或公開站。PR27 bounded synthetic恢復不等於上述已完成。本slice無UI改動；不重新跑bounded RC、不Owner登入、不承諾可掃描私有站。

## 離線驗證

```sh
python3 -B -m unittest discover -s prototype/private-site/bootstrap -p 'test_*.py' -v
node --test prototype/private-site/gateway.test.mjs prototype/wordpress-pilot/host.test.mjs
```

所有format/OS command在測試中攔截；只用臨時普通檔案、synthetic git repo與fake NVMe資料，沒有真block device、sudo、loop device、秘密或hosted操作。既有全CI維持，沒有增加UI或新治理服務。
