// Reverse proxy that fronts all music-apps on one port so ngrok only needs one tunnel.
// Usage: PORT=8080 node server.js
//
// Routes:
//   GET /                  -> launcher landing page (public/index.html)
//   /<slug>/*              -> http://127.0.0.1:<port>/<slug>/*  (Next.js basePath)
//   WebSocket upgrades on /<slug>/* are proxied too (Next dev HMR).
//
// No npm deps. Vanilla Node only.

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

// ---------------------------------------------------------------------------
// Auth (Basic, only triggers on non-LAN traffic)
// ---------------------------------------------------------------------------
//
// LAN devices (your iPad over Wi-Fi) skip auth and just work. Requests coming
// in through ngrok carry tell-tale headers (ngrok-agent-ips, x-forwarded-for)
// — those get challenged with a Basic-Auth realm. Browsers show a native
// login prompt and remember the answer for the rest of the tab session.
//
// Credentials are read in this order:
//   1. MUSIC_APPS_AUTH env var, format "user:password"
//   2. ~/.config/music-apps/auth  (one line, "user:password")
//   3. A fresh random password is generated and saved to (2), then printed.

const AUTH_FILE = path.join(os.homedir(), ".config", "music-apps", "auth");
const AUTH_REALM = "music-apps";

function loadOrCreateAuth() {
  // Env var wins so you can pin the password from run-all.sh if you want.
  const envAuth = process.env.MUSIC_APPS_AUTH;
  if (envAuth && envAuth.includes(":")) {
    return { ...parseUserPass(envAuth), generated: false, source: "env" };
  }

  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf8").trim();
    if (raw.includes(":")) {
      return { ...parseUserPass(raw), generated: false, source: AUTH_FILE };
    }
  } catch {
    // file doesn't exist or is unreadable — we'll generate one
  }

  // Generate a fresh password the first time and persist it so the credentials
  // stay stable across restarts. URL-safe alphabet, 16 chars (~95 bits).
  const password = crypto
    .randomBytes(24)
    .toString("base64")
    .replace(/[+/=]/g, "")
    .slice(0, 16);
  const user = "music";
  try {
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(AUTH_FILE, `${user}:${password}\n`, { mode: 0o600 });
  } catch (e) {
    console.warn(`[proxy] could not persist auth file (${e.message}); password will rotate on next restart`);
  }
  return { user, password, generated: true, source: AUTH_FILE };
}

function parseUserPass(s) {
  const idx = s.indexOf(":");
  return { user: s.slice(0, idx), password: s.slice(idx + 1) };
}

const AUTH = loadOrCreateAuth();
const AUTH_HEADER_VALUE =
  "Basic " + Buffer.from(`${AUTH.user}:${AUTH.password}`).toString("base64");

// Session cookie shape:
//   Name:  music_auth
//   Value: HMAC-SHA256(password, "music-auth-v1") truncated to 32 hex chars.
// Constant per password; rotates when the password rotates. Set once after a
// successful Basic-Auth challenge; checked first on every subsequent request.
// Fixes iPad Safari's habit of re-prompting on every <audio> / chunk subresource.
const SESSION_COOKIE_NAME = "music_auth";
const SESSION_COOKIE_VALUE = crypto
  .createHmac("sha256", AUTH.password)
  .update("music-auth-v1")
  .digest("hex")
  .slice(0, 32);
const SESSION_COOKIE_HEADER =
  `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`;

// Constant-time string compare so attackers can't gauge progress by timing.
function safeEq(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// A request is considered "public" (came in through ngrok or similar) when it
// carries headers we know the local LAN never sets. Direct LAN/localhost hits
// don't get challenged.
//
// PROXY_OPEN=1 disables the public-traffic auth gate entirely — useful when
// iPad Safari + Basic Auth subresource quirks make the cookie session
// unreliable behind ngrok. URL secrecy is the only protection in that mode.
function isPublicRequest(req) {
  if (process.env.PROXY_OPEN === "1") return false;
  if (req.headers["x-forwarded-for"]) return true;
  if (req.headers["x-forwarded-host"]) return true;
  if (req.headers["ngrok-agent-ips"]) return true;
  // ngrok forwards under hostnames ending in .ngrok.app / .ngrok-free.dev /
  // .ngrok.io / .ngrok.dev — any of these mean we're public.
  const host = (req.headers["host"] || "").toLowerCase();
  if (
    host.endsWith(".ngrok.app") ||
    host.endsWith(".ngrok-free.dev") ||
    host.endsWith(".ngrok.io") ||
    host.endsWith(".ngrok.dev")
  ) {
    return true;
  }
  return false;
}

function isAuthorized(req) {
  // Cookie-first: if the client already has the session cookie, accept it.
  // This is how every request after the initial sign-in avoids re-prompting
  // (browsers send Basic Auth credentials inconsistently to <audio> srcs,
  // HMR sockets, and Next dev chunks — but cookies they always send).
  const cookieHeader = req.headers["cookie"] || "";
  const m = cookieHeader.match(/(?:^|;\s*)music_auth=([0-9a-f]+)/);
  if (m && safeEq(m[1], SESSION_COOKIE_VALUE)) return true;

  const got = req.headers["authorization"];
  if (!got) return false;
  return safeEq(got, AUTH_HEADER_VALUE);
}

/** True iff this request authenticated via Basic Auth (NOT via cookie).
 *  Used to decide whether to set the cookie on the response. */
function authedViaBasic(req) {
  const got = req.headers["authorization"];
  return !!got && safeEq(got, AUTH_HEADER_VALUE);
}

function challenge(res, message) {
  res.writeHead(401, {
    "WWW-Authenticate": `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(message || "Authentication required\n");
}

// stripPrefix:
//   false  → upstream expects the /<slug> prefix in the URL (Next.js basePath).
//   true   → proxy removes /<slug> before forwarding (helaix-web's Go server,
//            which serves its SPA at root and resolves the prefix on the client
//            via Vite BASE_URL).
const APPS = {
  shreddy:    { port: 3000, name: "Shreddy",    tag: "Practice", desc: "Drop in a song. Loop the hard bits. Track what you've practiced.",   accent: "#ff4d2e", stripPrefix: false },
  lickbank:   { port: 3001, name: "LickBank",   tag: "Licks",    desc: "Clip the lick at 2:43. Name it. Practice it. Don't lose it again.", accent: "#5b6cff", stripPrefix: false },
  chordcraft: { port: 3002, name: "ChordCraft", tag: "Ear",      desc: "Train your ear to hear progressions. Listen, guess, level up.",     accent: "#17c27a", stripPrefix: false },
  metronome:  { port: 3003, name: "Metronome",  tag: "Time",     desc: "A focused metronome that gets out of the way.",                     accent: "#f5f5f7", stripPrefix: false },
  soundpath:  { port: 3004, name: "SoundPath",  tag: "Tone",     desc: "Explore signal paths and gain staging.",                            accent: "#a855f7", stripPrefix: false },
  helaix:     { port: 3005, name: "HelAIx",     tag: "Presets",  desc: "AI preset engineer for Line 6 Helix. Describe a tone, get a .hlx.", accent: "#fb923c", stripPrefix: true  },
  setlists:   { port: 3006, name: "Setlists",   tag: "Gigs",     desc: "Paste a playlist. Get practice tracks, licks and Helix patches.",   accent: "#8b5cf6", stripPrefix: false },
  // No port: a static bundle served straight off disk, so there's no extra
  // process to start and nothing in run-all.sh to keep in sync.
  tones:      { name: "Tone Search", tag: "Presets", desc: "Semantic search over 8,917 indexed CustomTone Helix presets.",             accent: "#22d3ee", static: path.resolve(__dirname, "../../helix-tone-search/web") },
};

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bin":  "application/octet-stream",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".woff2": "font/woff2",
};

const PROXY_PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";

// TLS for LAN recording. getUserMedia only runs in a secure context, so
// http://<lan-ip>:8080 can't record — the browser refuses before we ever
// reach the mic. Serving the same proxy over https with an mkcert-signed
// cert makes the LAN a secure context, no tunnel involved.
// Generate with:
//   mkcert -cert-file lan.pem -key-file lan-key.pem <lan-ip> localhost 127.0.0.1
// Skipped silently when the cert files aren't there.
const TLS_PORT = parseInt(process.env.TLS_PORT || "8443", 10);
const TLS_DIR = process.env.TLS_DIR || path.join(os.homedir(), ".config", "music-apps", "certs");

const LANDING_PATH = path.join(__dirname, "public", "index.html");

function matchApp(url) {
  // Match /<slug> exactly or /<slug>/... or /<slug>?...
  // Avoid matching prefixes like /shreddyfoo.
  for (const slug of Object.keys(APPS)) {
    if (url === "/" + slug) return slug;
    if (url.startsWith("/" + slug + "/")) return slug;
    if (url.startsWith("/" + slug + "?")) return slug;
  }
  return null;
}

function upstreamPath(slug, url) {
  if (!APPS[slug].stripPrefix) return url;
  // Strip "/<slug>" from the front. /shreddy → /, /shreddy/foo → /foo.
  const prefix = "/" + slug;
  if (url === prefix) return "/";
  if (url.startsWith(prefix + "/")) return url.slice(prefix.length);
  if (url.startsWith(prefix + "?")) return "/" + url.slice(prefix.length);
  return url;
}

function serveLanding(req, res) {
  fs.readFile(LANDING_PATH, (err, buf) => {
    if (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Landing page missing: " + err.message);
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(buf);
  });
}

/**
 * Serve a static app off disk. The bundle fetches its data with relative URLs,
 * so /tones has to redirect to /tones/ or those fetches resolve one level up.
 */
function serveStatic(req, res, slug) {
  const root = APPS[slug].static;
  const qIdx = req.url.indexOf("?");
  const pathname = qIdx === -1 ? req.url : req.url.slice(0, qIdx);

  if (pathname === "/" + slug) {
    res.writeHead(302, { location: "/" + slug + "/" + (qIdx === -1 ? "" : req.url.slice(qIdx)) });
    res.end();
    return;
  }

  let rel = pathname.slice(("/" + slug).length) || "/";
  if (rel.endsWith("/")) rel += "index.html";

  const file = path.join(root, path.normalize(rel));
  // path.normalize resolves "..", so a traversal attempt lands outside root.
  if (!file.startsWith(root)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(`Not found: ${pathname}`);
      return;
    }
    res.writeHead(200, {
      "content-type": STATIC_TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(buf);
  });
}

function proxyHttp(req, res, slug) {
  const port = APPS[slug].port;
  const opts = {
    host: "127.0.0.1",
    port,
    method: req.method,
    // Next apps want the basePath kept; helaix-web wants it stripped.
    path: upstreamPath(slug, req.url),
    headers: { ...req.headers, host: `127.0.0.1:${port}` },
  };

  const upstream = http.request(opts, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(res);
  });

  upstream.on("error", (e) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end(`Upstream error for /${slug} (port ${port}): ${e.message}`);
  });

  req.pipe(upstream);
}

/** Wrap res.writeHead so it appends the session cookie when needed, regardless
 *  of which handler downstream calls it (serveLanding, proxyHttp piping
 *  upstream headers, the 404 fallback). One-shot — only adds on first call. */
function injectSessionCookieIfNeeded(res) {
  const original = res.writeHead.bind(res);
  let injected = false;
  res.writeHead = function (statusCode, ...rest) {
    if (!injected) {
      injected = true;
      // Headers may live in rest[0] or rest[1] depending on call signature.
      let headers;
      let headersIdx = -1;
      if (rest.length >= 1 && rest[rest.length - 1] && typeof rest[rest.length - 1] === "object") {
        headersIdx = rest.length - 1;
        headers = rest[headersIdx];
      }
      const existing = headers && headers["set-cookie"];
      const merged = existing
        ? Array.isArray(existing)
          ? [...existing, SESSION_COOKIE_HEADER]
          : [existing, SESSION_COOKIE_HEADER]
        : SESSION_COOKIE_HEADER;
      if (headers) {
        headers["set-cookie"] = merged;
      } else {
        rest.push({ "set-cookie": SESSION_COOKIE_HEADER });
      }
    }
    return original(statusCode, ...rest);
  };
}

function handleRequest(req, res) {
  const url = req.url || "/";
  // Match on pathname so /?foo=bar still routes to /.
  const qIdx = url.indexOf("?");
  const pathname = qIdx === -1 ? url : url.slice(0, qIdx);

  // Auth gate — only challenges traffic that came in via ngrok. LAN hits pass.
  if (isPublicRequest(req) && !isAuthorized(req)) {
    challenge(res);
    return;
  }
  // If the client authed via Basic this time (vs cookie), set the session
  // cookie so subsequent requests skip the Basic prompt entirely. This is
  // the fix for iPad Safari re-prompting on every subresource.
  if (isPublicRequest(req) && authedViaBasic(req)) {
    injectSessionCookieIfNeeded(res);
  }

  if (pathname === "/" || pathname === "/index.html") {
    serveLanding(req, res);
    return;
  }

  // Health check.
  if (pathname === "/__proxy/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, apps: APPS }));
    return;
  }

  const slug = matchApp(url);
  if (slug) {
    if (APPS[slug].static) serveStatic(req, res, slug);
    else proxyHttp(req, res, slug);
    return;
  }

  // Fallback: 404 with a small hint.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`Not found: ${url}\nTry / or one of: ${Object.keys(APPS).map((s) => "/" + s).join(", ")}\n`);
}

// WebSocket upgrade handling — needed for Next dev HMR.
function handleUpgrade(req, clientSocket, head) {
  // Apply the same auth gate to WS upgrades from public traffic.
  if (isPublicRequest(req) && !isAuthorized(req)) {
    clientSocket.write(
      "HTTP/1.1 401 Unauthorized\r\n" +
      `WWW-Authenticate: Basic realm="${AUTH_REALM}"\r\n` +
      "Connection: close\r\n\r\n",
    );
    clientSocket.destroy();
    return;
  }
  const slug = matchApp(req.url || "");
  if (!slug) {
    clientSocket.destroy();
    return;
  }
  const port = APPS[slug].port;
  const upstream = net.connect(port, "127.0.0.1", () => {
    const upPath = upstreamPath(slug, req.url || "");
    let raw = `${req.method} ${upPath} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const vv of v) raw += `${k}: ${vv}\r\n`;
      } else {
        raw += `${k}: ${v}\r\n`;
      }
    }
    raw += "\r\n";
    upstream.write(raw);
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

const server = http.createServer(handleRequest);
server.on("upgrade", handleUpgrade);

// Same handlers, TLS in front. Started only when both cert files exist.
function startTls() {
  const certPath = path.join(TLS_DIR, "lan.pem");
  const keyPath = path.join(TLS_DIR, "lan-key.pem");
  let cert, key;
  try {
    cert = fs.readFileSync(certPath);
    key = fs.readFileSync(keyPath);
  } catch {
    return null;
  }
  const tls = https.createServer({ cert, key }, handleRequest);
  tls.on("upgrade", handleUpgrade);
  // TLS is the extra, not the point. An unhandled 'error' here is fatal to the
  // process, so a port already taken — usually a proxy from an earlier session
  // still running — would take plain http on 8080 down with it.
  tls.on("error", (err) => {
    console.warn(`  TLS off — :${TLS_PORT} unavailable (${err.code || err.message})`);
  });
  tls.listen(TLS_PORT, HOST);
  return tls;
}

const tlsServer = startTls();

server.listen(PROXY_PORT, HOST, () => {
  const authNote = AUTH.generated
    ? `  PUBLIC AUTH (NEW — saved to ${AUTH.source}):\n` +
      `    user: ${AUTH.user}\n` +
      `    pass: ${AUTH.password}\n` +
      `    (LAN hits skip this; only ngrok / forwarded traffic gets challenged.)\n`
    : `  PUBLIC AUTH from ${AUTH.source}: user=${AUTH.user} (password hidden — see ${AUTH.source})\n`;

  // `listening`, not just the object: a server whose listen failed is still an
  // object, and a banner promising https on a port nothing is bound to sends
  // you debugging the certificate instead of the port collision.
  const tlsNote = tlsServer?.listening
    ? `  TLS → https://${HOST}:${TLS_PORT}  (secure context: recording works over LAN)\n`
    : tlsServer
      ? `  TLS off — :${TLS_PORT} unavailable; recording over LAN needs https\n`
      : `  TLS off — no cert in ${TLS_DIR}; recording over LAN needs https (see the mkcert note in this file)\n`;

  const banner =
    `\n  music-apps proxy → http://${HOST}:${PROXY_PORT}\n` +
    tlsNote +
    Object.entries(APPS)
      .map(([s, a]) => `    /${s.padEnd(11)} → 127.0.0.1:${a.port}  (${a.name})`)
      .join("\n") +
    `\n\n${authNote}\n  Point ngrok at this port:  ngrok http ${PROXY_PORT}\n`;
  console.log(banner);
});
