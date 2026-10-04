#!/usr/bin/env bash
# Pending approval only. A window file is evidence of the separate Owner decision,
# not a substitute for it. Never run this script as an offline validation.
set -euo pipefail
window_file=${1:?approved window JSON required}
rc_root=/workspace/growth-internal-rc-01
service_pid=''
cleanup() {
  if [[ -n "$service_pid" ]]; then kill -TERM "$service_pid" 2>/dev/null || true; wait "$service_pid" 2>/dev/null || true; fi
  echo 'RC services stopped. Preserve evidence, then use operator cleanup with the same window; no automatic retry or reprovision.'
}
trap cleanup EXIT
node prototype/internal-rc/deploy/operator.mjs provision "$window_file"
node prototype/internal-rc/runtime.mjs "$rc_root/config.json" --crash-at-third-post > "$rc_root/evidence/runtime-a.log" 2>&1 &
service_pid=$!
node prototype/internal-rc/wait-ready.mjs
node prototype/internal-rc/acceptance.mjs phase-a
# All phase-A browser/driver and runtime processes now end. Native stores are separate services.
wait "$service_pid" || [[ $? == 137 ]]
service_pid=''
node prototype/internal-rc/runtime.mjs "$rc_root/config.json" > "$rc_root/evidence/runtime-b.log" 2>&1 &
service_pid=$!
node prototype/internal-rc/wait-ready.mjs
node prototype/internal-rc/acceptance.mjs phase-b
