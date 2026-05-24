#!/usr/bin/env bash
# alchemy-ws-repro / Bug #2 — three-probe demonstration.
#
# Usage:
#   Terminal 1: bun run dev   (wait for Realm + Game "Started")
#   Terminal 2: ./repro.sh
#
# Expected:
#   A. HTTP via /realm proxy → 426 Upgrade Required (from realm worker)
#   B. WS direct to realm   → 101 Switching Protocols (control)
#   C. WS via /realm proxy  → silent close, no response headers (BUG)

set -eu

HOST_REALM="realm.localhost:1337"
HOST_GAME="game.localhost:1337"

echo "===================================================================="
echo "A. HTTP forward via Vite /realm proxy (game.localhost → realm)"
echo "===================================================================="
curl -is --max-time 2 "http://${HOST_GAME}/realm/ws" | head -8
echo
echo "===================================================================="
echo "B. WS upgrade DIRECT to realm.localhost (control)"
echo "===================================================================="
curl -is --max-time 2 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "http://${HOST_REALM}/ws" | head -5
echo
echo "===================================================================="
echo "C. WS upgrade VIA Vite /realm proxy (the bug)"
echo "===================================================================="
curl -is --max-time 2 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "http://${HOST_GAME}/realm/ws"
echo
echo "(C: empty output above = silent close, the bug)"
