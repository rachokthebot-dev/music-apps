"use client";

// Compact tempo picker. Replaces the 12-pill horizontal row with a single
// button that opens a 4×3 grid popover. Saves ~400px on the transport bar.
//
// Layout:
//   [ 1.0× ▾ ]   ← collapsed button (~80px wide)
//   Opens upward (bottom-full) since it lives inside the sticky transport
//   bar; mb-2 keeps a small gap above the trigger so the popover doesn't
//   touch the button edge.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

interface TempoSelectProps {
  value: number;
  values: number[];
  onChange: (v: number) => void;
  busy?: boolean;
}

function fmtTempo(v: number): string {
  // 0.1 .. 1.2 always render with one decimal so column widths are stable.
  return `${v.toFixed(1)}×`;
}

export function TempoSelect({ value, values, onChange, busy }: TempoSelectProps) {
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

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className={`h-10 sm:h-11 px-3 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors active:scale-95 ${
          open
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground hover:bg-accent"
        } disabled:opacity-50`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Tempo"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
        <span className="tabular-nums">{fmtTempo(value)}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 mb-2 z-50 bg-card border border-border rounded-xl shadow-lg p-1.5 grid grid-cols-4 gap-1 min-w-[14rem]"
        >
          {values.map((v) => (
            <button
              key={v}
              role="option"
              aria-selected={v === value}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              className={`h-10 rounded-md text-sm font-semibold tabular-nums transition-colors active:scale-95 ${
                v === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {fmtTempo(v)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
