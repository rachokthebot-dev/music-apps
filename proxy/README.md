# music-apps proxy

Single-port reverse proxy that fronts every music app on this machine so one
ngrok tunnel can reach all of them. Without it, ngrok's free tier can only
forward a single port — so only one app would be reachable from the iPad/phone.

```
            ngrok :8080 (one tunnel)
                    │
                    ▼
        ┌───────────────────────┐
        │  proxy/server.js      │   ← landing at /
        │  port 8080            │   ← path-based routing
        └─────┬───┬───┬───┬───┬─┘
              │   │   │   │   │
         /shreddy /lickbank ... /helaix
              │   │   │   │   │
           :3000 :3001 :3002 :3003 :3004 :3005
            ▼     ▼     ▼     ▼     ▼     ▼
        Next.js  Next.js ...    Go + Vite SPA
```

## What's wired

| Path         | Upstream         | Stack         | Mount strategy |
|--------------|------------------|---------------|----------------|
| `/`          | proxy itself     | static HTML   | landing page   |
| `/shreddy`   | `127.0.0.1:3000` | Next.js 16    | Next `basePath` (no prefix strip) |
| `/lickbank`  | `127.0.0.1:3001` | Next.js 16    | Next `basePath` |
| `/chordcraft`| `127.0.0.1:3002` | Next.js 16    | Next `basePath` |
| `/metronome` | `127.0.0.1:3003` | Next.js 16    | Next `basePath` |
| `/soundpath` | `127.0.0.1:3004` | Next.js 16    | Next `basePath` |
| `/helaix`    | `127.0.0.1:3005` | Go + Vite SPA | Path-stripped (Vite `BASE_URL`) |
| `/__proxy/health` | proxy itself | —          | JSON status     |

The proxy also forwards WebSocket upgrades (needed for Next dev HMR).

## Run everything

From any directory:

```sh
~/claude/run-all.sh hub        # start all 6 apps in dev mode + the proxy
~/claude/run-all.sh prod       # build all and run in production mode
~/claude/run-all.sh proxy      # just the proxy (apps must already be running)
~/claude/run-all.sh stop       # kill ports 3000-3005 and the proxy
```

Then expose to the internet:

```sh
ngrok http 8080
```

The ngrok URL is the landing. Tap any app card to open it.

## How the path routing works

### Next.js apps (no prefix strip)
Each app sets `basePath: "/<slug>"` in `next.config.ts`. Next.js then prefixes
all of its own URLs (assets, `<Link>`, `next/image`, route handlers). The proxy
forwards the request URL verbatim:

```
browser  →  https://<ngrok>/shreddy/api/songs
proxy    →  127.0.0.1:3000/shreddy/api/songs   (URL unchanged)
Next     →  serves /api/songs handler under its basePath
```

**Gotcha — and the fix that lives in each app's `layout.tsx`:**
Next.js does **not** auto-prefix client-side `fetch()` calls. Code like
`fetch("/api/songs")` would hit `https://<ngrok>/api/songs` (no prefix), and
the proxy would 404 because it doesn't know which app that belongs to. So each
Next app's `src/app/layout.tsx` injects a tiny `<script>` in `<head>` that
wraps `window.fetch` and `XMLHttpRequest.prototype.open` to prepend the
basePath whenever the URL starts with `/api/` or `/uploads/`. The shim is
search-and-replaceable: look for `BP='/<slug>'` to find it.

### HelAIx (prefix stripped)
The Go server (`helaix/app/cmd/server/main.go`) serves the SPA from `/`. The
proxy strips the `/helaix` prefix before forwarding:

```
browser  →  https://<ngrok>/helaix/assets/foo.js
proxy    →  127.0.0.1:3005/assets/foo.js       (prefix stripped)
Go       →  serves frontend/dist/assets/foo.js
```

The SPA was built with `VITE_BASE=/helaix/`, so all its `<script src>`/`<link
href>` and the `fetch` shim (in `wailsjs/go/main/App.js`) emit URLs prefixed
with `/helaix/`. That keeps the browser-side URL space consistent while
letting the Go server stay path-prefix-unaware.

## File map

```
projects/
├── music-apps/
│   ├── apps/{shreddy,lickbank,chordcraft,metronome,soundpath}/
│   │   ├── next.config.ts                ← basePath: "/<slug>"
│   │   └── src/app/layout.tsx            ← fetch shim
│   └── proxy/
│       ├── server.js                     ← the proxy (no npm deps)
│       ├── public/index.html             ← landing page
│       └── README.md                     ← this file
└── helaix/
    └── app/
        ├── cmd/server/main.go            ← Go HTTP wrapper
        ├── frontend/
        │   ├── vite.config.js            ← base: process.env.VITE_BASE
        │   └── wailsjs/go/main/App.js    ← dual-mode (Wails + web) shim
        └── bin/helaix-web                ← built binary

run-all.sh                                ← orchestrator (top of ~/claude)
projects/music-apps/.logs/                ← runtime logs for all six
```

## Auth

The proxy enforces Basic auth, but **only on traffic that came through ngrok**
(or any forwarder that adds `X-Forwarded-For` / `X-Forwarded-Host` / the
`ngrok-agent-ips` header, or whose `Host` ends in `.ngrok-*`). Direct LAN /
localhost hits pass through unchallenged — so the iPad on Wi-Fi at
`http://192.168.1.X:8080` keeps working without typing a password, but the
public ngrok URL gates everything behind credentials.

Credentials are resolved in this order:
1. `MUSIC_APPS_AUTH` env var (`user:password`)
2. `~/.config/music-apps/auth` (single line, `user:password`, perm 0600)
3. First-run generates a fresh random password and writes it to (2), then
   prints it to the proxy's stdout banner.

To rotate the password: delete `~/.config/music-apps/auth` and restart the
proxy; a new one is generated and printed. To pin one: write your own line
to that file, or export `MUSIC_APPS_AUTH=user:mypassword` before launching.

On the iPad, Safari will show a native Basic-auth login prompt the first time
you hit the ngrok URL and remember the answer for the tab session. You can
also bake credentials into a bookmark as
`https://user:password@<your-tunnel>.ngrok-free.dev/` if you want zero
friction.

The gate is "fail-closed": a request that *claims* to be public (by adding
`X-Forwarded-For` from a LAN curl) is challenged anyway. There is no
backdoor through header manipulation.

## Configuration

```sh
PORT=8080            # proxy listen port; matches the ngrok target
HOST=0.0.0.0         # bind address (0.0.0.0 lets iPad/phone hit the LAN too)
MUSIC_APPS_AUTH      # optional: "user:password" — overrides the file
```

To add another app:

1. Add the app to `APPS` in `server.js`. Choose `stripPrefix` based on whether
   the upstream understands the URL prefix (Next.js apps with `basePath`:
   `false`; everything else: `true`).
2. If it's a Next app, add `basePath: "/<slug>"` to its `next.config.ts` and the
   fetch shim from any other layout to its `src/app/layout.tsx` (swap the
   slug in `BP='/<slug>'`).
3. Add a card to `public/index.html`.
4. Add it to `run-all.sh`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `502 Bad Gateway` on `/<slug>` | Upstream app not running. Check `.logs/<slug>.start.log`. |
| App page loads but "Failed to load" | Fetch shim missing or wrong basePath. Inspect the source of `/<slug>` and grep for `BP='/<slug>'`. |
| Asset 404s in DevTools | `basePath` not set in `next.config.ts` (Next) or `VITE_BASE` not set during build (HelAIx). |
| HMR / fast-refresh doesn't reconnect through proxy | WebSocket upgrade handler in `server.js`; check there's no 502 on `/_next/webpack-hmr`. |
| ngrok returns an interstitial warning page | Free-tier first-visit gate. Click "Visit Site" once, or add header `ngrok-skip-browser-warning: 1` (curl). |
