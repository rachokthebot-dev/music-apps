"use client";

// The player header's ⋯ menu. Actions you reach for once a session (re-analyze,
// share, find a tone) live here so the header keeps only what you toggle
// while playing.

import { useEffect, useRef, useState } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";

export interface MoreMenuItem {
  label: string;
  icon: React.ReactNode;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
}

export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98] transition-all disabled:opacity-40";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="size-11 rounded-full border border-border bg-card grid place-items-center text-foreground hover:bg-muted active:scale-95 transition-all"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
      >
        <DotsThreeIcon className="size-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 min-w-[13rem] rounded-2xl border border-border bg-popover p-1.5 shadow-lg">
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                {item.icon}
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
                className={itemClass}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
