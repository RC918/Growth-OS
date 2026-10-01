#!/bin/zsh
# HUMAN credential handoff only. Does not enable LOGIN or set a probe window.
set -eu
unset PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export PGCONNECT_TIMEOUT=15
export PGSSLMODE=verify-full
export PGSSLROOTCERT="${0:A:h}/prod-ca-2021.crt"
# Public CA obtained from the HTTPS URL in Supabase's official Dashboard source.
# Scope trust to this command, never the system/keychain/global PostgreSQL store.
probe_ca_fingerprint=$(/opt/homebrew/bin/openssl x509 -in "$PGSSLROOTCERT" -noout -fingerprint -sha256)
if [[ "$probe_ca_fingerprint" != 'sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA' ]]; then
 print -u2 '官方 CA 憑證與已核對指紋不符，已停止；不要輸入密碼。'
 exit 1
fi
if [[ "${1-}" == '--check-tls' && $# == 1 ]]; then
 exec /opt/homebrew/bin/openssl s_client -starttls postgres \
  -connect aws-0-ap-southeast-1.pooler.supabase.com:5432 \
  -servername aws-0-ap-southeast-1.pooler.supabase.com \
  -CAfile "$PGSSLROOTCERT" -verify_return_error \
  -verify_hostname aws-0-ap-southeast-1.pooler.supabase.com </dev/null
fi
if (( $# != 0 )); then
 print -u2 '僅支援無參數的本人密碼輸入，或 --check-tls 無密碼診斷。'
 exit 1
fi
# Empty regular password file suppresses fallback to the user's saved credentials.
# No credential is ever written here; clean it on exit, including failures.
probe_empty_passfile=$(mktemp -t growth-os-empty-passfile)
chmod 600 "$probe_empty_passfile"
export PGPASSFILE="$probe_empty_passfile"
trap 'rm -f -- "$probe_empty_passfile"' EXIT
print 'Growth OS 測試專案：只設定 growth_os_probe_login 密碼，不啟用窗口。'
print '請本人輸入既有資料庫管理密碼，再輸入新 probe 密碼兩次。全部由 psql 不回顯提示收取。'
print '不要將密碼貼進聊天或命令列；若不知道管理密碼，請停止，勿重設共享密碼。'
/opt/homebrew/bin/psql -X -W \
 --host=aws-0-ap-southeast-1.pooler.supabase.com --port=5432 \
 --dbname=postgres --username=postgres.vhzryhibmpvglzcmfnaa \
 --set=ON_ERROR_STOP=1 --command='\password growth_os_probe_login'
