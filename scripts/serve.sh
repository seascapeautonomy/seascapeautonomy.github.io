#!/usr/bin/env bash
# Run the site locally with the Astro dev server, in the background.
#
#   npm run serve            # start (or reuse) the dev server and print its address
#   npm run serve -- stop    # stop it
#   npm run serve -- restart # stop, then start again (e.g. after changing astro.config)
#   npm run serve -- status  # say whether it is running
#   npm run serve -- logs    # follow its log output (Ctrl+C stops following, not the server)
#
# The server keeps running after this script exits and reloads pages as you save files.
set -euo pipefail

PORT="${PORT:-4321}"
URL="http://localhost:$PORT"
cd "$(dirname "$0")/.."

# `astro dev status` exits 0 even when nothing is running, so ask the server itself.
running() { curl -s -o /dev/null "$URL/"; }

start() {
  if running; then
    echo "The dev server is already running at $URL"
    return
  fi
  echo "Starting the dev server…"
  npx astro dev --background --port "$PORT" >/dev/null
  for _ in $(seq 1 60); do
    if running; then
      echo "The site is running at $URL"
      echo "Stop it with: npm run serve -- stop"
      return
    fi
    sleep 0.5
  done
  echo "The dev server did not answer at $URL. Recent logs:" >&2
  npx astro dev logs >&2 || true
  exit 1
}

case "${1:-start}" in
  start) start ;;
  stop) npx astro dev stop ;;
  restart)
    npx astro dev stop >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do running || break; sleep 0.5; done
    start
    ;;
  status) npx astro dev status ;;
  logs) npx astro dev logs --follow ;;
  *) echo "Usage: npm run serve -- [start|stop|restart|status|logs]" >&2; exit 1 ;;
esac
