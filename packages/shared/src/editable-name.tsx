"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What a Helix shows. Anything longer is cut on the way into the file, so the
 * field stops you there rather than letting you type a name the export halves.
 */
export const HELIX_NAME_MAX = 16;

interface EditableNameProps {
  value: string;
  onCommit: (next: string) => void;
  /** Typed by a person rather than read off the preset — marked, not hidden. */
  edited?: boolean;
  /** Longest name accepted. Defaults to what a Helix can display. */
  maxLength?: number;
  className?: string;
  title?: string;
}

/**
 * A name you can type over, in place.
 *
 * Enter and blur commit; Escape puts back what was there — a name is the one
 * thing on these screens you might start editing and think better of. Shared
 * because SoundPath and Setlists both rename the same patches, and two
 * different rename interactions for one object is how you end up unsure
 * whether the last one saved.
 */
export function EditableName({
  value,
  onCommit,
  edited,
  maxLength = HELIX_NAME_MAX,
  className = "",
  title,
}: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  // A rename that lands elsewhere — a re-push, a reload — should show up here
  // rather than leaving a stale draft behind the next time this opens.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`bg-background border border-violet-500/50 rounded px-1.5 py-0.5 outline-none min-w-0 w-full ${className}`}
      />
    );
  }

  return (
    <button
      onClick={(e) => {
        // Rename controls sit inside rows that expand or drag on click.
        e.stopPropagation();
        setEditing(true);
      }}
      title={title ?? (edited ? "Renamed here — click to edit" : "Click to rename")}
      className={`group inline-flex items-center gap-1 min-w-0 text-left hover:text-violet-500 ${className}`}
    >
      <span className="truncate">{value}</span>
      <span
        className={`shrink-0 text-[9px] group-hover:text-violet-500 ${
          edited ? "text-violet-500/70" : "text-muted-foreground/40"
        }`}
      >
        ✎
      </span>
    </button>
  );
}
