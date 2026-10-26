"use client";

import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  GaugeIcon,
  ListNumbersIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { AppShell, SidebarItem, SidebarSection } from "@music-apps/shared/app-shell";

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
const VIEWS = [
  { href: "/", label: "Library", icon: SquaresFourIcon },
  // Smallest to largest: one sound off the pedal, one preset, a whole gig.
  // Quick level has the bench's diagnostics folded underneath it.
  { href: "/measure", label: "Quick level", icon: GaugeIcon },
  { href: "/level", label: "Preset", icon: SlidersHorizontalIcon },
  { href: "/setlist", label: "Setlist", icon: ListNumbersIcon },
] as const;

const TOOLS = [
  { href: "/help", label: "Recording guide", icon: BookOpenIcon },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  // basePath is stripped from pathname, so these are what we see.
  const pathname = usePathname() ?? "/";
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const item = ({ href, label, icon: Icon }: (typeof VIEWS)[number] | (typeof TOOLS)[number]) => (
    <SidebarItem
      key={href}
      href={href}
      active={isActive(href)}
      icon={<Icon className="size-5" weight={isActive(href) ? "fill" : "regular"} />}
      label={label}
    />
  );
  return (
    <AppShell
      appId="soundpath"
      title="soundpath"
      sidebar={
        <>
          {VIEWS.map(item)}
          <SidebarSection label="Tools" />
          {TOOLS.map(item)}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
