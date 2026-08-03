// Inline boot script that applies the shared light/dark theme before first
// paint. Contract for the localStorage "theme" key (shared across all apps on
// the proxy origin at :8080):
//
//   "dark"           → dark mode (adds .dark to <html>)
//   any other value  → light mode (typically "light")
//   absent           → follow the system prefers-color-scheme
//
// Shreddy, Metronome, ChordCraft, and LickBank carry byte-identical inline
// copies of this script in their root layouts — if the contract ever changes,
// update those too. The launcher (proxy/public/index.html) implements the
// same logic with its own inline copy.
//
// Usage in a Next.js root layout (html needs suppressHydrationWarning):
//
//     import { themeInitSource } from "@music-apps/shared";
//
//     <script dangerouslySetInnerHTML={{ __html: themeInitSource }} />

export const themeInitSource =
  "try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch{}";
