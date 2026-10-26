"use client";

// The frame every music app sits in: a 17rem sidebar on the left with the
// app's name, the app menu and its folders or sections, and the page beside it.
//
// One component rather than a copy per app, so Shreddy, LickBank, ChordCraft
// and the rest can't drift apart again. From iPad landscape (lg) up the sidebar
// is a fixed column; below that it is a drawer, opened with <SidebarMenuButton>
// from the page's own header. The page scrolls the document, not an inner box,
// so Safari's toolbar still collapses on a phone.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ListIcon, MoonIcon, PlusIcon, SunIcon } from "@phosphor-icons/react";
import { AppSwitcher } from "./app-switcher";

const DrawerContext = createContext<{ open: () => void; close: () => void }>({
  open: () => {},
  close: () => {},
});

export function AppShell({
  appId,
  title,
  sidebar,
  footer,
  children,
}: {
  /** Matches an id in APP_REGISTRY, for the app menu. */
  appId: string;
  title: string;
  /** Nav items and sections, top to bottom. Scrolls when it runs long. */
  sidebar: React.ReactNode;
  /** Pinned under the nav, above the theme toggle — Shreddy's streak card. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const open = useCallback(() => setDrawerOpen(true), []);
  const close = useCallback(() => setDrawerOpen(false), []);

  return (
    <DrawerContext.Provider value={{ open, close }}>
      <div className="flex-1 w-full min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        {drawerOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} />}
        <aside
          className={`${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-none fixed lg:sticky inset-y-0 lg:top-0 left-0 z-40 w-72 lg:w-auto h-dvh bg-card border-r border-border transition-transform duration-500 ease-spring flex flex-col px-4 pt-6 pb-4`}
        >
          <div className="flex items-center justify-between pl-3 mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            <AppSwitcher currentAppId={appId} />
          </div>
          <nav className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-0.5">{sidebar}</nav>
          {footer && <div className="mt-4">{footer}</div>}
          <ThemeToggle />
        </aside>
        <div className="min-w-0 flex flex-col">{children}</div>
      </div>
    </DrawerContext.Provider>
  );
}

const itemClass = (active: boolean) =>
  `w-full h-11 px-3 rounded-xl flex items-center gap-3 text-base transition-colors active:scale-[0.98] ${
    active ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
  }`;

/**
 * One row in the sidebar. A link when given `href`, a button otherwise; either
 * way it closes the drawer, since picking something is the end of the visit.
 */
export function SidebarItem({
  active = false,
  icon,
  label,
  count,
  href,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  href?: string;
  onClick?: () => void;
}) {
  const { close } = useContext(DrawerContext);
  const body = (
    <>
      <span className="size-5 shrink-0 grid place-items-center">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && <span className="text-sm text-muted-foreground tabular-nums">{count}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} onClick={close} className={itemClass(active)}>
        {body}
      </Link>
    );
  }
  return (
    <button
      onClick={() => {
        onClick?.();
        close();
      }}
      className={itemClass(active)}
    >
      {body}
    </button>
  );
}

/** A small uppercase heading between groups of items — "Folders", "Genres". */
export function SidebarSection({ label, onAdd, addLabel }: { label: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center justify-between pl-3 pt-5 pb-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {onAdd && (
        <button
          onClick={onAdd}
          className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
          title={addLabel}
          aria-label={addLabel}
        >
          <PlusIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Opens the drawer. Goes in the page header; hidden once the sidebar is a column. */
export function SidebarMenuButton() {
  const { open } = useContext(DrawerContext);
  return (
    <button
      className="lg:hidden size-11 shrink-0 -ml-2 rounded-full grid place-items-center hover:bg-muted"
      onClick={open}
      aria-label="Menu"
    >
      <ListIcon className="size-6" />
    </button>
  );
}

/** Light/dark, stored the way every app's theme-init script reads it. */
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // private mode — the choice just lasts until reload
    }
  };
  return (
    <button onClick={toggle} className={`${itemClass(false)} mt-2`}>
      {dark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
