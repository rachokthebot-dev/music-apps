/** Central registry of all apps in the music-apps suite.
 *  Add new apps here — all app switchers update automatically.
 *
 *  URLs are proxy-relative: every app is mounted at its slug (Next basePath)
 *  behind proxy/server.js on a single origin, so a bare path like "/shreddy"
 *  is all that's needed. The all-apps launcher lives at the proxy root "/".  */

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  /** Proxy-relative base path where this app is mounted (its "home"). */
  basePath: string;
}

/** The all-apps launcher (landing page) served by the proxy at its root. */
export const LAUNCHER_PATH = "/";

export const APP_REGISTRY: AppEntry[] = [
  { id: "shreddy",    name: "Shreddy",    description: "Practice companion",   basePath: "/shreddy" },
  { id: "lickbank",   name: "LickBank",   description: "Lick & solo library",  basePath: "/lickbank" },
  { id: "chordcraft", name: "ChordCraft", description: "Chord progressions",   basePath: "/chordcraft" },
  { id: "metronome",  name: "Metronome",  description: "Tempo & timer",        basePath: "/metronome" },
  { id: "soundpath",  name: "SoundPath",  description: "Tone & signal paths",  basePath: "/soundpath" },
  { id: "helaix",     name: "HelAIx",     description: "AI Helix presets",     basePath: "/helaix" },
  { id: "setlists",   name: "Setlists",   description: "Gig prep & patches",   basePath: "/setlists" },
  { id: "tones",      name: "Tone Search", description: "Find a Helix preset", basePath: "/tones" },
];

/** Build the URL for an app. Proxy-relative, so it works on localhost, the
 *  iPad over Wi-Fi, and through ngrok — every device hits the same origin. */
export function getAppUrl(app: AppEntry): string {
  return app.basePath;
}
