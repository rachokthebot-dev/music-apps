# Running the music apps — the one runbook

Deterministic steps to run all six apps behind the single-URL proxy. Two ways to reach
them: **local network** or **public via ngrok**. Everything is driven by one script:
`~/claude/run-all.sh`.

## The one command

```bash
~/claude/run-all.sh hub     # start all 6 apps (dev) + the reverse proxy
~/claude/run-all.sh stop    # stop everything (ports 3000-3005 + 8080)
```

**Never** start apps individually (`npm run dev:<app>`) — that misses HelAIx (`:3005`)
and the proxy, and cross-app navigation breaks. Always use `run-all.sh hub`.

If something is already running, stop first:

```bash
~/claude/run-all.sh stop && ~/claude/run-all.sh hub
```

First run only: `cd ~/claude/projects/music-apps && npm install`.

## What runs where

| App        | Port | Path (via proxy) |
|------------|------|------------------|
| Shreddy    | 3000 | `/shreddy`       |
| LickBank   | 3001 | `/lickbank`      |
| ChordCraft | 3002 | `/chordcraft`    |
| Metronome  | 3003 | `/metronome`     |
| SoundPath  | 3004 | `/soundpath`     |
| HelAIx     | 3005 | `/helaix`        |
| **Proxy — landing + routing** | **8080** | **`/`** |

Ports **3000–3005 are backends only**. The launcher landing and app-to-app links use
bare paths (`/`, `/lickbank`), so they only resolve on the **proxy origin, port 8080**.
Always use `:8080` to actually *use* the apps.

## Option A — Local network (Mac + iPad/phone on the same Wi-Fi)

1. `~/claude/run-all.sh hub`
2. On the Mac: **http://localhost:8080/**
3. On another device on the same network: **http://&lt;mac-ip&gt;:8080/**
   Find the IP: `ipconfig getifaddr en1` (or `en0`). Currently `192.168.1.18` →
   **http://192.168.1.18:8080/**

LAN/localhost traffic skips the auth prompt.

## Option B — Public via ngrok (e.g. iPad on cellular)

1. `~/claude/run-all.sh hub`   (leave it running)
2. In another terminal: `ngrok http 8080`
3. Open the `https://<random>.ngrok.app` URL ngrok prints.

Public/ngrok traffic is gated by HTTP basic-auth (LAN is not). Credentials live in
`~/.config/music-apps/auth` (username `music`; password is in that file — **don't commit
it**). Rotate by deleting that file and restarting the hub.

## Verify it's up

```bash
curl -s -o /dev/null -w "landing %{http_code}\n" http://localhost:8080/
curl -s -o /dev/null -w "shreddy %{http_code}\n" http://localhost:8080/shreddy
```

Both should be `200`. Runtime logs: `~/claude/projects/music-apps/.logs/`.

## Gotchas

- **Use `:8080` for everything.** Hitting an app on its own port (e.g.
  `localhost:3000/`) 404s — each app has a `basePath`, and the "All apps" launcher +
  switcher only work through the proxy.
- **Stale page in the browser** (old README/landing, broken nav) is browser cache, not
  the server — hard-refresh (Cmd+Shift+R) or clear site data for the origin. Verify the
  server truth with the `curl` checks above.
- **Don't occupy port 8080** with anything else — it's the proxy's.
