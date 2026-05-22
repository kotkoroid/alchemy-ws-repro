# alchemy-ws-repro

Minimal reproduction for an `alchemy dev` (v2.0.0-beta.40) issue: **WebSocket
upgrades to a `Cloudflare.Worker` from a browser fail with close code 1006
and zero headers exchanged**, while plain HTTP works and terminal-side WS
clients (curl, Bun's `WebSocket`) also work.

## Setup

```sh
bun install
bun run dev
```

`alchemy dev` will route the `Realm` worker at `http://realm.localhost:1337`
(falls back to `:1338+` if the port is busy — adjust the URLs below if so).

## Repro

### 1. HTTP works

```sh
curl -i http://realm.localhost:1337/
# HTTP/1.1 404 Not Found
# hello from realm
```

### 2. WS from terminal works

```sh
curl -is -N \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://realm.localhost:1337/ws
# HTTP/1.1 101 Switching Protocols
# Connection: Upgrade
# Upgrade: websocket
# Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
#
# hello from PartyRoom
```

Bun's `WebSocket` client also works:

```js
const ws = new WebSocket('ws://realm.localhost:1337/ws');
// open
// msg hello from PartyRoom
// msg echo: ping  (after ws.send('ping'))
```

### 3. WS from the browser fails — from a Vite-served sibling subdomain

Open `http://game.localhost:1337/` in Chrome and click **Open WebSocket**.
The page is a minimal `Cloudflare.Vite` SPA that sits on a sibling subdomain
of the Realm worker (matching the layout of a real app: SPA on one
subdomain, WebSocket server on another, both served by `alchemy dev`).

Observed:

```
connecting to ws://realm.localhost:1337/ws
error
closed 1006
```

Network panel shows **0 request headers, 0 response headers** — the upgrade
handshake never completes. (Confirmed in Chrome 141 on macOS; the same Bun
WebSocket client succeeds against the same URL at the same moment.)

The same failure reproduces from `about:blank`:

```js
const ws = new WebSocket('ws://realm.localhost:1337/ws');
ws.onerror = () => console.log('error');
ws.onclose = (e) => console.log('closed', e.code);
```

## What the worker does

`src/Realm.ts` — routes `GET /ws` to the `PartyRoom` DO; otherwise 404.

`src/PartyRoom.ts` — `Cloudflare.upgrade()` accepts the WS, greets, echoes.

Mirrors a `Worker → DurableObject` shape, with the DO doing the upgrade.

## Hypothesis

The cross-client behavior — terminal/Bun WS works, browser WS doesn't —
points at something the browser sends that the terminal clients don't. Most
likely **`Sec-WebSocket-Extensions: permessage-deflate; …`** or a particular
`Sec-WebSocket-Protocol` header.

Code path:

- `local-proxy.worker.ts` (in `@distilled.cloud/cloudflare-runtime`) forwards
  subdomain-routed requests via `fetch(proxied, request).then(promise.resolve)`,
  with no explicit `new Response(null, { status: 101, webSocket: resp.webSocket })`
  wrap around the response.
- HTTP and minimal-header WS upgrades survive that hop fine.
- Browser upgrades (with permessage-deflate) appear not to.

## Expected

Browser `new WebSocket('ws://realm.localhost:1337/ws')` should connect and
log `hello from PartyRoom` like the Bun client does.

## Versions

- `alchemy@2.0.0-beta.40`
- `effect@4.0.0-beta.66`
- `workerd@1.20260417.1`
- Chrome 141 on macOS arm64
