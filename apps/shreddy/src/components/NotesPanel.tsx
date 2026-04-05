"use client";

import { useState } from "react";
import { StickyNote, ChevronDown, ChevronUp } from "lucide-react";

interface NotesPanelProps {
  notesDraft: string;
  onNotesChange: (value: string) => void;
}

export function NotesPanel({ notesDraft, onNotesChange }: NotesPanelProps) {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <button
        onClick={() => setNotesOpen(!notesOpen)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground w-full"
      >
        <StickyNote className="size-4 text-muted-foreground" />
        Notes
        {notesDraft && !notesOpen && (
          <span className="text-xs text-muted-foreground font-normal truncate flex-1 text-left ml-1">
            — {notesDraft.slice(0, 60)}
          </span>
        )}
        {notesOpen ? (
          <ChevronUp className="size-4 text-muted-foreground ml-auto" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground ml-auto" />
        )}
      </button>
      {notesOpen && (
        <div className="mt-3 flex border border-border rounded-lg bg-background overflow-hidden min-h-[200px]">
          <div className="w-9 shrink-0 bg-muted/30 border-r border-border py-3 select-none">
            {(notesDraft || "\n").split("\n").map((_, i) => (
              <div key={i} className="text-[11px] text-muted-foreground/50 text-right pr-2 font-mono leading-[1.5rem]">{i + 1}</div>
            ))}
          </div>
          <textarea
            value={notesDraft}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Add practice notes..."
            className="flex-1 p-3 text-sm leading-[1.5rem] bg-transparent resize-none min-h-[200px] focus:outline-none text-foreground placeholder:text-muted-foreground"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          />
        </div>
      )}
    </div>
  );
}
