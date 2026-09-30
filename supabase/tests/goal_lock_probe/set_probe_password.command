#!/bin/zsh
# HUMAN credential handoff only. Does not enable LOGIN or set a probe window.
set -eu
unset PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export PGPASSFILE=/dev/null
export PGCONNECT_TIMEOUT=15
export PGSSLMODE=verify-full
export PGSSLROOTCERT=system
print 'Growth OS 測試專案：只設定 growth_os_probe_login 密碼，不啟用窗口。'
print '請本人輸入既有資料庫管理密碼，再輸入新 probe 密碼兩次。全部由 psql 不回顯提示收取。'
print '不要將密碼貼進聊天或命令列；若不知道管理密碼，請停止，勿重設共享密碼。'
exec /opt/homebrew/bin/psql -X -W \
 --host=aws-0-ap-southeast-1.pooler.supabase.com --port=5432 \
 --dbname=postgres --username=postgres.vhzryhibmpvglzcmfnaa \
 --set=ON_ERROR_STOP=1 --command='\password growth_os_probe_login'
