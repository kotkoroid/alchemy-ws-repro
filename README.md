# alchemy-ws-repro

Two related WebSocket-upgrade failures in `alchemy dev`. Both involve
`workerd` serving a Worker behind alchemy's local-subdomain dev
infrastructure; both make HTTP fine and WS broken.

| | Bug #1 | Bug #2 |
|---|---|---|
| **What fails** | Browser WS direct to `realm.localhost:1337/ws` | **Any** client's WS upgrade via `game.localhost:1337/realm/ws` (cross-subdomain forward through Vite's `/realm` proxy) |
| **What works** | Curl WS, Bun WS, browser HTTP — to the same URL | Curl/Bun/browser HTTP through the same forward path |
| **Client filter** | Browser-only (closes with code 1006, 0 headers) | Affects every client including curl |
| **Smoking signal** | Network panel shows 0 request + 0 response headers | Connection closes before any response headers are produced |
| **Status (2026-05-28)** | **Open.** Reproduces against alchemy `c1ec6ca` / `2.0.0-beta.44` under Bun 1.3.14 | **Open under Bun** (upstream Bun, see below). Per maintainer, goes away if alchemy is run under Node 26 |

## Status after maintainer triage (May 2026)

- **Bug #2** classified by the alchemy maintainer as **upstream Bun**:
  Vite's bundled `http-proxy` running on Bun mishandles WS upgrades.
  Tracker: [oven-sh/bun#28396](https://github.com/oven-sh/bun/issues/28396).
  *"Nothing we can do about it in Bun … recurring issue for months."*
  Workaround on the alchemy side: run alchemy under Node 26+ (Vite then
  uses Node's `http-proxy`, which works).
- **Node 26 startup blocker** for that workaround fixed in
  [alchemy-run/alchemy-effect#458](https://github.com/alchemy-run/alchemy-effect/pull/458)
  (disables `--experimental-transform-types`, which Node 26 removed).
  Shipped in the `c1ec6ca` preview branch / `2.0.0-beta.44`. *This is the
  only fix shipped so far for either bug — it doesn't fix the bugs
  themselves, it makes the "run under Node 26" workaround feasible.*
- **Bug #1** still open. Maintainer couldn't reproduce on their machine
  from a regular `localhost` page; this repo's expanded repro
  (Vite-served sibling subdomain) is the canonical reproduction.

## Setup

```sh
bun install
bun run dev
```

`alchemy dev` will spin up two workers + serve a Vite SPA:

```
realmUrl: http://realm.localhost:1337
gameUrl:  http://game.localhost:1337
```

(falls back to `:1338+` if the port is busy — adjust the URLs below if so).

## Bug #1 — Browser WS direct to a workerd subdomain fails

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
of the Realm worker.

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

## Bug #2 — WS upgrade through Vite's `/realm` proxy fails (any client)

The documented workaround for Bug #1 is "route the browser's WS through
Vite's `/realm` proxy with `ws: true`". `game/vite.config.ts` configures
this proxy. HTTP forwards through it cleanly; WS upgrades on the same URL
get eaten. Reproducible from curl — no browser needed.

### A. HTTP via the `/realm` Vite proxy works

```sh
curl -i http://game.localhost:1337/realm/ws
# HTTP/1.1 426 Upgrade Required
# Content-Type: text/plain
# Vary: Origin
#
# Expected WebSocket upgrade
```

That 426 body is the realm worker's own response — proves the request
reached the realm worker via `game.localhost:1337/realm/*` → Vite's proxy
→ `realm.localhost:1337/*`.

### B. WS upgrade direct to the realm subdomain works (control)

```sh
curl -is --max-time 2 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://realm.localhost:1337/ws
# HTTP/1.1 101 Switching Protocols
# Connection: Upgrade
# Upgrade: websocket
# Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

### C. SAME WS upgrade through the Vite proxy hangs and closes

```sh
curl -is --max-time 2 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://game.localhost:1337/realm/ws
# (empty — no response headers, connection closes before establishment)
```

Same URL as **A**, same target as **B**, only the `Upgrade` header
discriminates. The forward is working for HTTP and the target accepts WS
directly — the failure is specifically in how Vite's proxy (running inside
the `alchemy dev` bundle) hands off the WS upgrade to workerd on a
`*.localhost` subdomain.

In the browser this manifests as `WebSocket is closed before the
connection is established.` from the same `ws://game.localhost:1337/realm/ws`
URL.

## What the worker does

`src/Realm.ts` — routes `GET /ws` to the `PartyRoom` DO; otherwise 404.

`src/PartyRoom.ts` — `Cloudflare.upgrade()` accepts the WS, greets, echoes.

`game/vite.config.ts` — mounts `/realm` Vite proxy with `ws: true`
forwarding to `realm.localhost:1337`. Used to demonstrate Bug #2; the
browser-test page in Bug #1 connects directly to `realm.localhost:1337`
and doesn't depend on the proxy.

## Hypothesis

**Bug #1**: the cross-client behavior — terminal/Bun WS works, browser WS
doesn't — points at something the browser sends that terminal clients
don't. Most likely **`Sec-WebSocket-Extensions: permessage-deflate; …`**
or a particular `Sec-WebSocket-Protocol` header.

Code path:

- `local-proxy.worker.ts` (in `@distilled.cloud/cloudflare-runtime`) forwards
  subdomain-routed requests via `fetch(proxied, request).then(promise.resolve)`,
  with no explicit `new Response(null, { status: 101, webSocket: resp.webSocket })`
  wrap around the response.
- HTTP and minimal-header WS upgrades survive that hop fine.
- Browser upgrades (with permessage-deflate) appear not to.

**Bug #2**: Vite's `server.proxy` with `ws: true` is implemented over
`http-proxy` (Node-side). Under Bun, `http-proxy`'s WS upgrade path
trips on Bun's `net.Socket` (e.g. missing `destroySoon`, plus deeper
upstream-Bun issues tracked in [oven-sh/bun#28396](https://github.com/oven-sh/bun/issues/28396)).
The handshake response side never produces headers and the connection
closes. Reproducible without a browser. Per the alchemy maintainer,
this manifestation is purely a Bun ↔ `http-proxy` interaction — running
alchemy under Node 26 makes it go away.

## Expected

- **Bug #1**: Browser `new WebSocket('ws://realm.localhost:1337/ws')` should
  connect and log `hello from PartyRoom` like the Bun client does.
- **Bug #2**: Curl/Bun WS via `ws://game.localhost:1337/realm/ws` should
  return `101 Switching Protocols` and the WS frames from the realm
  worker, just as direct `ws://realm.localhost:1337/ws` does.

## Versions

- `alchemy` preview `c1ec6ca` (= `2.0.0-beta.44` with PR #458)
- `effect@4.0.0-beta.66`
- `workerd@1.20260417.1`
- Bun 1.3.14, Node 26.0.0 (host candidates)
- Chrome 141 / Brave on macOS arm64

## Retest matrix

This is what the maintainer asked us to verify on the preview branch.
Each row is one full pass after `bun install && bun run dev` (or `node`
equivalent), with `./repro.sh` for #2 and the browser page for #1.

| Host runtime | Bug #1 (browser direct) | Bug #2 (Vite `/realm` proxy, curl) | Notes |
|---|---|---|---|
| Bun 1.3.14 | ☐ | **FAIL** (2026-05-28) | `./repro.sh` C: silent close, A returns 426, B returns 101 |
| Node 26.0.0 | ☐ | ☐ | requires PR #458 to start at all |

Bun-host result detail (2026-05-28, alchemy `c1ec6ca` / `2.0.0-beta.44`,
Bun 1.3.14, macOS arm64):

```
A. HTTP forward via Vite /realm proxy (game.localhost → realm)
   HTTP/1.1 426 Upgrade Required
   Expected WebSocket upgrade

B. WS upgrade DIRECT to realm.localhost (control)
   HTTP/1.1 101 Switching Protocols
   Connection: Upgrade
   Upgrade: websocket
   Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

C. WS upgrade VIA Vite /realm proxy (the bug)
   (silent close — no response headers)
```

Only the `Upgrade: websocket` request header discriminates between A
(works) and C (silent close), with identical upstream resolution to
B (works). The failure is specifically in how Vite's `http-proxy`
under Bun hands off the upgrade.
