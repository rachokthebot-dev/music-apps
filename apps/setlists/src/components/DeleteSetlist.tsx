"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@phosphor-icons/react";

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
      className={`shrink-0 rounded-full transition-all duration-200 ease-spring active:scale-90 disabled:opacity-50 ${
        confirming
          ? "h-11 px-4 text-sm font-semibold text-destructive bg-destructive/10"
          : "size-11 grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      }`}
    >
      {busy ? "…" : confirming ? "Tap again" : <TrashIcon className="size-5" />}
    </button>
  );
}
