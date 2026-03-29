"use client";

import { useState, useEffect, useRef } from "react";
import { APP_REGISTRY, getAppUrl, type AppEntry } from "./app-registry";

interface AppSwitcherProps {
  /** The id of the current app (must match an id in APP_REGISTRY) */
  currentAppId: string;
}

export function AppSwitcher({ currentAppId }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentApp = APP_REGISTRY.find((a) => a.id === currentAppId);
  const otherApps = APP_REGISTRY.filter((a) => a.id !== currentAppId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg text-xs md:text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <GridIcon />
        <span className="hidden sm:inline">{currentApp?.name ?? "Apps"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 md:w-64 rounded-xl border border-border bg-card shadow-lg shadow-black/20 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Music Apps
            </span>
          </div>
          <div className="p-1.5">
            {APP_REGISTRY.map((app) => {
              const isCurrent = app.id === currentAppId;
              return (
                <a
                  key={app.id}
                  href={isCurrent ? undefined : getAppUrl(app)}
                  onClick={isCurrent ? () => setOpen(false) : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-lg transition-colors ${
                    isCurrent
                      ? "bg-primary/10 text-primary cursor-default"
                      : "hover:bg-secondary text-foreground cursor-pointer"
                  }`}
                >
                  <AppIcon appId={app.id} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{app.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                          current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{app.description}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="md:w-[18px] md:h-[18px]">
      <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="10" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="1" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="10" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function AppIcon({ appId }: { appId: string }) {
  const iconClass = "w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-sm font-bold";

  switch (appId) {
    case "shreddy":
      return <div className={`${iconClass} bg-orange-500/15 text-orange-400`}>S</div>;
    case "lickbank":
      return <div className={`${iconClass} bg-blue-500/15 text-blue-400`}>L</div>;
    case "chordcraft":
      return <div className={`${iconClass} bg-purple-500/15 text-purple-400`}>C</div>;
    default:
      return <div className={`${iconClass} bg-secondary text-muted-foreground`}>{appId[0]?.toUpperCase()}</div>;
  }
}
