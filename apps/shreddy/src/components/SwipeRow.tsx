"use client";

// A list row that slides left to reveal its actions, the way Mail does. On an
// iPad that beats a row of small always-visible icons: nothing to mis-tap
// while scrolling, and each action gets a full-height target.
//
// A horizontal drag opens it; a vertical one is left to the page so scrolling
// still works (touch-action: pan-y). Tapping an open row closes it rather than
// following the row's click. The parent owns which row is open, so opening one
// closes the others.

import { useRef, useState } from "react";

export interface SwipeAction {
  label: string;
  icon: React.ReactNode;
  className: string;
  onSelect: () => void;
}

const ACTION_WIDTH = 88;

interface SwipeRowProps {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** Passed through to the outer element, for list code that finds rows by it. */
  "data-song-id"?: string;
}

export function SwipeRow({ actions, open, onOpenChange, className, style, children, ...rest }: SwipeRowProps) {
  const width = actions.length * ACTION_WIDTH;
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; swiping: boolean } | null>(null);
  const swallowClick = useRef(false);

  const offset = drag ?? (open ? -width : 0);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -width : 0, swiping: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null; // a scroll, not a swipe
        return;
      }
      if (Math.abs(dx) < 10) return;
      s.swiping = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch { /* pointer already gone */ }
    }
    setDrag(Math.min(0, Math.max(-width - 24, s.base + dx)));
  }

  function onPointerUp() {
    const s = start.current;
    start.current = null;
    if (!s?.swiping) return;
    swallowClick.current = true;
    onOpenChange((drag ?? 0) < -width / 2);
    setDrag(null);
  }

  return (
    <li {...rest} style={style} className={`relative overflow-hidden ${className ?? ""}`}>
      {/* Only drawn while showing, so the red edge of Delete never peeks
          around the closed row's rounded corner. */}
      {(open || drag !== null) && (
      <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
              a.onSelect();
            }}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold text-white active:brightness-90 ${a.className}`}
            style={{ width: ACTION_WIDTH }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (swallowClick.current || open) {
            e.stopPropagation();
            e.preventDefault();
            swallowClick.current = false;
            if (open) onOpenChange(false);
          }
        }}
        className={`relative bg-card ${drag === null ? "transition-transform duration-500 ease-spring" : ""}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
      >
        {children}
      </div>
    </li>
  );
}
