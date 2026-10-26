"use client";

import { usePathname } from "next/navigation";
import { GearSixIcon, MicrophoneStageIcon, PlusIcon } from "@phosphor-icons/react";
import { AppShell, SidebarItem } from "@music-apps/shared/app-shell";

const ITEMS = [
  { href: "/", label: "Setlists", icon: MicrophoneStageIcon },
  { href: "/new", label: "New setlist", icon: PlusIcon },
  { href: "/settings", label: "Settings", icon: GearSixIcon },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  return (
    <AppShell
      appId="setlists"
      title="Setlists"
      sidebar={ITEMS.map(({ href, label, icon: Icon }) => {
        // A saved setlist lives under /s/, and belongs to the list.
        const active = href === "/" ? pathname === "/" || pathname.startsWith("/s/") : pathname.startsWith(href);
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
    >
      {children}
    </AppShell>
  );
}
