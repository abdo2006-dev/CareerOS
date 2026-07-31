#!/usr/bin/env bash
# Stops the loopback-only tunnel started by dev-tunnel.sh.
set -euo pipefail

PID_FILE="/tmp/careeros-dev-tunnel.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "no dev tunnel pid file found -- nothing to stop"
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}"
  echo "dev tunnel stopped (pid ${PID})"
else
  echo "dev tunnel process (pid ${PID}) was not running"
fi
rm -f "${PID_FILE}"
