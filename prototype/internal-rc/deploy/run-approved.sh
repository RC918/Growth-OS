#!/usr/bin/env bash
# Pending approval only. Invoke phase-a and phase-b in TWO SEPARATE commands.
# No coordinating shell, browser, driver, IPC broker or app service survives phase A.
set -euo pipefail
phase=${1:?phase-a or phase-b required}
window_file=${2:?approved window JSON required}
rc_root=/workspace/growth-internal-rc-01
service_pid=''
cleanup() {
  if [[ -n "$service_pid" ]]; then kill -TERM "$service_pid" 2>/dev/null || true; wait "$service_pid" 2>/dev/null || true; fi
  echo 'This phase and its app service have exited. Native stores remain within the original approved window; no automatic retry or reprovision.'
}
trap cleanup EXIT
if [[ "$phase" == phase-a ]]; then
  node prototype/internal-rc/deploy/operator.mjs provision "$window_file"
  node prototype/internal-rc/runtime.mjs "$rc_root/config.json" --crash-at-third-post > "$rc_root/evidence/runtime-a.log" 2>&1 &
  service_pid=$!
  node prototype/internal-rc/wait-ready.mjs
  node prototype/internal-rc/acceptance.mjs phase-a
  wait "$service_pid" || [[ $? == 137 ]]
  service_pid=''
elif [[ "$phase" == phase-b ]]; then
  # Existing immutable window must match; never provision, extend expiry or create a grant.
  node prototype/internal-rc/deploy/operator.mjs verify "$window_file"
  node prototype/internal-rc/runtime.mjs "$rc_root/config.json" > "$rc_root/evidence/runtime-b.log" 2>&1 &
  service_pid=$!
  node prototype/internal-rc/wait-ready.mjs
  node prototype/internal-rc/acceptance.mjs phase-b
else
  echo 'Only phase-a or phase-b is accepted.' >&2
  exit 2
fi
