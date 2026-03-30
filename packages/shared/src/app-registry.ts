/** Central registry of all apps in the music-apps suite.
 *  Add new apps here — all app switchers update automatically. */

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  port: number;
  /** Path within the app that serves as its "home" */
  path: string;
}

export const APP_REGISTRY: AppEntry[] = [
  {
    id: "shreddy",
    name: "Shreddy",
    description: "Practice companion",
    port: 3000,
    path: "/",
  },
  {
    id: "lickbank",
    name: "LickBank",
    description: "Lick & solo library",
    port: 3001,
    path: "/",
  },
  {
    id: "chordcraft",
    name: "ChordCraft",
    description: "Chord progressions",
    port: 3002,
    path: "/",
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Practice overview",
    port: 3002,
    path: "/dashboard",
  },
];

/** Build the URL for an app based on the current window location.
 *  Preserves the hostname so it works on iPad (192.168.x.x) and localhost. */
export function getAppUrl(app: AppEntry): string {
  if (typeof window === "undefined") return `http://localhost:${app.port}${app.path}`;
  return `${window.location.protocol}//${window.location.hostname}:${app.port}${app.path}`;
}
