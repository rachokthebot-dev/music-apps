"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Three views. The library is what you have; the preset leveller is one patch
 * on its own; the setlist view is the whole gig at once. Cramming them onto one
 * page made it long and no task clear.
 *
 * A/B compare used to sit in the middle slot. It answered "is this preset
 * louder than that one", which stopped being a question worth asking once every
 * preset is levelled against one absolute target — and it answered it from the
 * parameter estimator, which was wrong by 20 dB on real patches.
 */
const TABS = [
  { href: "/", label: "Library", hint: "Everything stored here" },
  { href: "/level", label: "Preset", hint: "One preset, levelled on its own" },
  { href: "/setlist", label: "Setlist", hint: "The whole gig, levelled together" },
] as const;

export function ViewTabs() {
  const pathname = usePathname();
  // basePath is stripped from pathname, so these are what we see.
  const current = pathname?.startsWith("/setlist")
    ? "/setlist"
    : pathname?.startsWith("/level")
      ? "/level"
      : "/";

  return (
    <nav className="flex gap-1 mb-5 border-b border-border">
      {TABS.map((t) => {
        const active = current === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            title={t.hint}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
