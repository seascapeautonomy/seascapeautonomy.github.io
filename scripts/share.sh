#!/usr/bin/env bash
# Share the current site over the internet for review, via a Cloudflare quick tunnel.
#
#   npm run share            # build, serve and print a public https://…trycloudflare.com link
#   npm run share -- --no-build   # reuse the existing dist/ build
#
# Serves the production build (not the dev server). The link works while this script runs,
# changes every time, and anyone who has it can view the site. Press Ctrl+C to stop sharing.
set -euo pipefail

PORT="${PORT:-4400}"
cd "$(dirname "$0")/.."

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared is not installed. See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

port_pids() { ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; }
if [[ -n "$(port_pids)" ]] || ss -ltnH "sport = :$PORT" | grep -q .; then
  echo "Port $PORT is already in use. Stop whatever is using it, or pick another: PORT=4401 npm run share" >&2
  exit 1
fi

if [[ "${1:-}" != "--no-build" ]]; then
  echo "Building the site…"
  if ! BUILD_LOG="$(npm run build 2>&1)"; then
    echo "$BUILD_LOG" >&2
    echo "The build failed; nothing was shared." >&2
    exit 1
  fi
fi

LOG_DIR="$(mktemp -d)"
cleanup() {
  echo
  echo "Stopping…"
  [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  # Astro's launcher re-spawns the server as a separate process, so also stop whatever is
  # listening on our port (it was free when we started).
  port_pids | xargs -r kill 2>/dev/null || true
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT INT TERM

echo "Starting the preview server on port $PORT…"
npx astro preview --port "$PORT" >"$LOG_DIR/preview.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "The preview server failed to start (is port $PORT in use? try PORT=4401 npm run share):" >&2
    cat "$LOG_DIR/preview.log" >&2
    exit 1
  fi
  sleep 0.5
done

echo "Opening the tunnel…"
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!
URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -1 || true)"
  [[ -n "$URL" ]] && break
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "cloudflared exited before giving a link:" >&2
    cat "$LOG_DIR/tunnel.log" >&2
    exit 1
  fi
  sleep 0.5
done
if [[ -z "$URL" ]]; then
  echo "Timed out waiting for a link from cloudflared:" >&2
  cat "$LOG_DIR/tunnel.log" >&2
  exit 1
fi

# The link can take a few seconds to start answering after it is printed.
for _ in $(seq 1 30); do
  curl -s -o /dev/null --max-time 5 "$URL" && break
  sleep 1
done

cat <<EOF

  Share this link:  $URL
  (local copy:      http://localhost:$PORT)

  The link can take up to a minute to start working for others.
  Anyone with the link can view the site while this runs. Press Ctrl+C to stop sharing.

EOF

wait "$TUNNEL_PID"
