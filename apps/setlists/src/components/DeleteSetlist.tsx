"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Two-tap confirm rather than a dialog — deleting a setlist is cheap to redo
 * (it doesn't touch what was imported into Shreddy or LickBank), but it's still
 * destructive enough that one stray tap shouldn't do it.
 */
export function DeleteSetlist({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await fetch(`/setlists/api/setlists/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={`Delete setlist ${name}`}
      title={confirming ? "Tap again to delete" : "Delete setlist"}
      className={`shrink-0 rounded-lg transition-colors disabled:opacity-50 ${
        confirming
          ? "px-2.5 py-1.5 text-[11px] font-bold text-destructive bg-destructive/10"
          : "p-2 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
      }`}
    >
      {busy ? (
        "…"
      ) : confirming ? (
        "Tap again"
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      )}
    </button>
  );
}
