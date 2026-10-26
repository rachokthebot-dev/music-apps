"use client";

import { usePathname } from "next/navigation";
import { ChartBarIcon, HeadphonesIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { AppShell, SidebarItem } from "@music-apps/shared/app-shell";

const SECTIONS = [
  { href: "/", label: "Practice", icon: MusicNotesIcon },
  { href: "/ear-training", label: "Ear Training", icon: HeadphonesIcon },
  { href: "/stats", label: "Stats", icon: ChartBarIcon },
];

/**
 * ChordCraft's sidebar: its three sections, then whatever the page adds under
 * them — the practice page puts its genres there, the way Shreddy and LickBank
 * list their folders.
 */
export function Shell({ extra, children }: { extra?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell
      appId="chordcraft"
      title="ChordCraft"
      sidebar={
        <>
          {SECTIONS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <SidebarItem
                key={href}
                href={href}
                active={active}
                icon={<Icon className="size-5" weight={active ? "fill" : "regular"} />}
                label={label}
              />
            );
          })}
          {extra}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
