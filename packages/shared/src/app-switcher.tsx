"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { APP_REGISTRY, getAppUrl, LAUNCHER_PATH } from "./app-registry";

interface AppSwitcherProps {
  /** The id of the current app (must match an id in APP_REGISTRY) */
  currentAppId: string;
}

/** Keep the panel on screen even when the button is near an edge. */
const MARGIN = 8;

export function AppSwitcher({ currentAppId }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const currentApp = APP_REGISTRY.find((a) => a.id === currentAppId);

  /**
   * Where the panel sits, in viewport coordinates.
   *
   * It is `fixed` so a scrolling ancestor can't clip it, which means the
   * position has to be measured rather than inherited. This used to be read
   * straight out of `getBoundingClientRect()` during render: impure, and
   * measured exactly once — scroll or rotate with the menu open and the panel
   * stayed where it was while the button moved away from it. On a page
   * scrolled far enough that the header had left the viewport it opened above
   * the fold, off screen entirely.
   *
   * Measured after layout instead, and again on scroll and resize.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = menuRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = panelRef.current?.offsetHeight ?? 0;
      const maxTop = Math.max(MARGIN, window.innerHeight - height - MARGIN);
      setPos({
        top: Math.min(Math.max(MARGIN, anchor.bottom + 4), maxTop),
        right: Math.max(MARGIN, window.innerWidth - anchor.right),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

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
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
        title={currentApp?.name ?? "Apps"}
      >
        <GridIcon />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="fixed w-64 md:w-72 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-lg shadow-black/20 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          // Hidden for the one frame before it has been measured, so it can't
          // flash at the top-left corner on the way to where it belongs.
          style={pos ? { top: pos.top, right: pos.right } : { top: 0, right: 0, visibility: "hidden" }}
        >
          <div className="px-3 py-2 border-b border-border sticky top-0 bg-card z-10">
            <span className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Music Apps
            </span>
          </div>
          <div className="p-1.5">
            {/* Back to the all-apps launcher. Plain <a> (not next/link) so the
                app's basePath is NOT prepended — this must hit the proxy root. */}
            <a
              href={LAUNCHER_PATH}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-secondary text-foreground cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary text-muted-foreground shrink-0">
                <HomeIcon />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm">All apps</span>
                <span className="block text-xs text-muted-foreground truncate">Back to the launcher</span>
              </div>
            </a>
            <div className="my-1 border-t border-border" />
            {APP_REGISTRY.map((app) => {
              const isCurrent = app.id === currentAppId;
              return (
                <a
                  key={app.id}
                  href={isCurrent ? undefined : getAppUrl(app)}
                  onClick={isCurrent ? () => setOpen(false) : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
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
                    <span className="text-xs text-muted-foreground truncate">{app.description}</span>
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

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="md:w-[18px] md:h-[18px]">
      <path
        d="M2 7.5L8 2.5l6 5M3.5 6.5V13a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AppIcon({ appId }: { appId: string }) {
  const iconClass = "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0";

  switch (appId) {
    case "shreddy":
      return <div className={`${iconClass} bg-orange-500/15 text-orange-400`}>S</div>;
    case "lickbank":
      return <div className={`${iconClass} bg-blue-500/15 text-blue-400`}>L</div>;
    case "chordcraft":
      return <div className={`${iconClass} bg-purple-500/15 text-purple-400`}>C</div>;
    case "metronome":
      return <div className={`${iconClass} bg-rose-500/15 text-rose-400`}>M</div>;
    case "soundpath":
      return <div className={`${iconClass} bg-violet-500/15 text-violet-400`}>P</div>;
    case "helaix":
      return <div className={`${iconClass} bg-amber-500/15 text-amber-400`}>H</div>;
    // Emerald, since violet is already SoundPath's.
    case "setlists":
      return <div className={`${iconClass} bg-emerald-500/15 text-emerald-500`}>G</div>;
    case "tones":
      return <div className={`${iconClass} bg-cyan-500/15 text-cyan-500`}>T</div>;
    default:
      return <div className={`${iconClass} bg-secondary text-muted-foreground`}>{appId[0]?.toUpperCase()}</div>;
  }
}
