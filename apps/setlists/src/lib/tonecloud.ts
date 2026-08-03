import { getToneCloudCreds } from "./settings";

const LOGIN_URL = "https://line6.com/account/login.html";
const DELIVER_URL = (id: string) => `https://line6.com/customtone/tone/deliver/${id}/`;

/** Session cookies last a while; re-logging in per download would be rude. */
let sessionCookie: string | null = null;
let sessionAt = 0;
const SESSION_TTL_MS = 30 * 60 * 1000;

function cookiesFromSetCookie(headers: Headers): string {
  const raw = headers.getSetCookie?.() ?? [];
  return raw
    .map((c) => c.split(";")[0])
    .filter((c) => /^L6/.test(c))
    .join("; ");
}

async function login(): Promise<string> {
  if (sessionCookie && Date.now() - sessionAt < SESSION_TTL_MS) return sessionCookie;

  const creds = await getToneCloudCreds();
  if (!creds) {
    throw new Error("No ToneCloud credentials — add them in Settings");
  }

  const body = new URLSearchParams({
    action: "login",
    redirect: "/customtone/",
    method: "modal",
    l_user: creds.email,
    l_pass: creds.password,
  });

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });

  const cookie = cookiesFromSetCookie(res.headers);
  if (!/L6loggedin/.test(cookie)) {
    throw new Error("ToneCloud login failed — check the credentials in Settings");
  }

  sessionCookie = cookie;
  sessionAt = Date.now();
  return cookie;
}

/** ToneCloud tone ids appear in the URL: /customtone/tone/<id>/ */
export function toneIdFromUrl(url: string): string | null {
  const m = url.match(/customtone\/tone\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Fetch a preset as parsed JSON. Line 6 serves it from a JS-driven "deliver"
 * endpoint rather than a plain link, and only to a signed-in session.
 */
export async function downloadPreset(toneId: string): Promise<unknown> {
  const cookie = await login();
  const res = await fetch(DELIVER_URL(toneId), {
    headers: { Cookie: cookie, "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`ToneCloud returned ${res.status}`);

  const text = await res.text();
  // A signed-out session gets an HTML page instead of the file.
  if (text.trimStart().startsWith("<")) {
    sessionCookie = null;
    throw new Error("ToneCloud returned a page, not a preset — the session may have expired");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Downloaded preset was not valid JSON");
  }
}
