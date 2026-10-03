#!/bin/zsh
# HUMAN-only authentication, after reviewed exact UTC window has been activated.
set -eu
if (( $# != 0 )); then
 print -u2 '不接受密碼或其他參數。'
 exit 1
fi
probe_directory="${0:A:h}"
print '只在主管核對精確窗口並啟用後執行；A/B/C 各由本人輸入同一 probe 密碼。'
print '結束時需本人輸入管理密碼一次清理；不貼密碼、不記錄 Terminal 工作階段。'
exec /usr/bin/python3 "$probe_directory/remote_overlap.py" \
 --window "$probe_directory/approved-window.json" \
 --output-dir "${probe_directory:h:h:h:h:h}/outputs"
