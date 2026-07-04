"use client";

/**
 * LibraryPicker — small modal listing the presets DB (fed by HelAIx ingest and
 * past SoundPath flows). Picking one loads it into the pane's slot server-side
 * via POST /api/preset/[slot] { presetId }.
 */

import { useEffect, useState } from "react";

type LibraryPreset = {
  id: string;
  name: string;
  sourceApp: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (presetId: string, name: string) => void;
};

export default function LibraryPicker({ open, onClose, onPick }: Props) {
  const [presets, setPresets] = useState<LibraryPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPresets(null);
    setError(null);
    (async () => {
      try {
        const r = await fetch("/soundpath/api/presets");
        const j = (await r.json()) as { ok: boolean; presets?: LibraryPreset[]; error?: string };
        if (!j.ok) throw new Error(j.error ?? "failed to list presets");
        setPresets(j.presets ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[70vh] overflow-y-auto rounded-lg border border-input bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Load from library</h2>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground underline">
            close
          </button>
        </header>

        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        {!error && presets === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {presets?.length === 0 && (
          <p className="text-sm text-muted-foreground">Library is empty.</p>
        )}

        <ul className="space-y-1">
          {presets?.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onPick(p.id, p.name)}
                className="w-full text-left rounded-md border border-border bg-secondary/50 hover:bg-secondary px-3 py-2"
              >
                <div className="text-sm text-foreground truncate">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {p.sourceApp} · {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
