#!/bin/bash
# ┌─────────────────────────────────────────────────────────────┐
# │  D&D Lite — one-click online host (macOS)                    │
# │  Double-click this file in Finder. It starts the game server │
# │  + a free Cloudflare tunnel and prints an invite link.       │
# └─────────────────────────────────────────────────────────────┘
cd "$(dirname "$0")" || exit 1

SERVER_LOG="/tmp/dndlite-server.log"
TUNNEL_LOG="/tmp/dndlite-tunnel.log"
SERVER_PID=""
TUNNEL_PID=""

pause_exit() { echo; echo "(Press any key to close this window.)"; read -r -n1 -s; exit "${1:-1}"; }

cleanup() {
  echo; echo "Shutting down…"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ── 1. Requirements ──────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org and try again."
  pause_exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (one-time)…"
  npm install || { echo "npm install failed."; pause_exit 1; }
fi

# cloudflared: prefer one already installed, then a local copy, then Homebrew,
# then a direct download (so a host without Homebrew still works).
CF="$(command -v cloudflared 2>/dev/null || true)"
[ -z "$CF" ] && [ -x "./.bin/cloudflared" ] && CF="./.bin/cloudflared"
if [ -z "$CF" ] && command -v brew >/dev/null 2>&1; then
  echo "Installing cloudflared (one-time)…"
  brew install cloudflared && CF="$(command -v cloudflared 2>/dev/null || true)"
fi
if [ -z "$CF" ]; then
  echo "Downloading cloudflared (one-time)…"
  case "$(uname -m)" in arm64) A=arm64 ;; *) A=amd64 ;; esac
  mkdir -p .bin
  if curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${A}.tgz" -o .bin/cf.tgz \
     && tar xzf .bin/cf.tgz -C .bin && chmod +x .bin/cloudflared; then
    rm -f .bin/cf.tgz
    xattr -d com.apple.quarantine .bin/cloudflared 2>/dev/null
    CF="./.bin/cloudflared"
  fi
fi
if [ -z "$CF" ]; then
  echo "Couldn't get cloudflared automatically."
  echo "Install it manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  pause_exit 1
fi

# ── 2. Game server (reuse one already on :3000, else start it) ─
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "A server is already running on :3000 — reusing it."
else
  echo "Starting the game server…"
  node server.js >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
fi

# wait until it answers
for _ in $(seq 1 30); do
  curl -s -o /dev/null http://localhost:3000 && break
  sleep 0.3
done

# ── 3. Cloudflare quick tunnel (free, no account) ────────────
echo "Opening a public tunnel…"
: > "$TUNNEL_LOG"
"$CF" tunnel --url http://localhost:3000 >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 50); do
  URL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "Couldn't get a public URL. See $TUNNEL_LOG"
  cleanup
fi

# ── 4. Show the invite ───────────────────────────────────────
printf '%s' "$URL" | pbcopy 2>/dev/null
clear
cat <<BANNER
==================================================================

   🎲  D&D Lite is LIVE — share this link with your party

        $URL

   (copied to your clipboard — give it ~20s to go live the first time)

   • Players:  open the link → enter a name + the session code
   • DM:       open the link → click  DM

   Keep this window open while you play.
   Press  Ctrl-C  here to stop the game and close the link.

==================================================================
BANNER

open "$URL" 2>/dev/null   # open it on the host too

# Keep running until Ctrl-C (or a started server exits)
if [ -n "$SERVER_PID" ]; then wait "$SERVER_PID"; else wait "$TUNNEL_PID"; fi
