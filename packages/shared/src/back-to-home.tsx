"use client";

import Link from "next/link";

interface BackToHomeProps {
  /** Text next to the arrow. Defaults to "Back". */
  label?: string;
  /** Extra classes for the link wrapper. */
  className?: string;
}

/** Back control for a sub-page → the app's own main screen.
 *
 *  Uses next/link with href="/", so the app's basePath IS prepended and the
 *  link resolves to the app home (e.g. /shreddy), not the proxy launcher.
 *  (For the launcher, use AppSwitcher's "All apps" entry instead.) */
export function BackToHome({ label = "Back", className = "" }: BackToHomeProps) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1.5 p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${className}`}
      aria-label="Back to home"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M11 4l-5 5 5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </Link>
  );
}
