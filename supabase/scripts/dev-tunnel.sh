#!/usr/bin/env bash
# Opens loopback-only (127.0.0.1) forwards to the local Supabase stack running
# inside the Colima VM.
#
# Why this exists: Colima's default "ssh" port forwarder mirrors a container's
# published bind address to the host. Supabase's local containers publish on
# 0.0.0.0, so Colima's automatic forwarder would otherwise also bind 0.0.0.0 on
# this Mac -- making the local dev stack reachable from anyone else on the same
# network. `supabase/config.toml`'s "portForwarder: none" (see
# ~/.colima/default/colima.yaml on this machine) disables that automatic,
# LAN-reachable forwarding; this script replaces it with explicit,
# loopback-only (127.0.0.1) forwards for exactly the ports CareerOS needs.
#
# Usage:
#   supabase start
#   ./supabase/scripts/dev-tunnel.sh
#   ... develop ...
#   ./supabase/scripts/dev-tunnel-stop.sh
#   supabase stop
set -euo pipefail

SSH_CONFIG="${HOME}/.colima/ssh_config"
PID_FILE="/tmp/careeros-dev-tunnel.pid"

# Ports must match supabase/config.toml ([api].port, [db].port, [studio].port,
# [local_smtp].port).
PORTS=(54321 54322 54323 54324)

if [[ ! -f "${SSH_CONFIG}" ]]; then
  echo "error: ${SSH_CONFIG} not found -- is Colima installed and has 'colima start' been run?" >&2
  exit 1
fi

if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  echo "dev tunnel already running (pid $(cat "${PID_FILE}"))"
  exit 0
fi

FORWARD_ARGS=()
for port in "${PORTS[@]}"; do
  FORWARD_ARGS+=(-L "127.0.0.1:${port}:127.0.0.1:${port}")
done

ssh -F "${SSH_CONFIG}" colima -f -N "${FORWARD_ARGS[@]}"

# Find the backgrounded ssh process we just started. It cannot be matched by
# command line (OpenSSH rewrites its own process title to "ssh: <ctl-path>
# [mux]" once backgrounded), so identify it instead by which process is
# listening on the first forwarded port.
sleep 1
PID="$(lsof -nP -iTCP:"${PORTS[0]}" -sTCP:LISTEN -t 2>/dev/null | head -1)"
if [[ -z "${PID}" ]]; then
  echo "error: tunnel process not found after starting -- check 'colima status'" >&2
  exit 1
fi
echo "${PID}" > "${PID_FILE}"
echo "dev tunnel started (pid ${PID}), forwarding 127.0.0.1 ports: ${PORTS[*]}"
