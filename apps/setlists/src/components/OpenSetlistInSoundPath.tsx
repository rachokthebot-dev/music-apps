"use client";

import { useState } from "react";

/**
 * Send every downloaded preset to SoundPath at once and open it there.
 *
 * Per-preset hand-off made you do it eight times to answer one question —
 * whether anything jumps between songs. SoundPath's setlist view answers that
 * for the whole gig, and is where recordings get measured against the estimate.
 */
export function OpenSetlistInSoundPath({ setlistId }: { setlistId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");

  const open = async () => {
    setState("sending");
    try {
      const res = await fetch(`/setlists/api/setlists/${setlistId}/soundpath`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  return (
    <button
      onClick={open}
      disabled={state === "sending"}
      className="text-sm font-semibold px-4 py-2.5 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-700 disabled:opacity-50"
    >
      {state === "sending"
        ? "Sending…"
        : state === "error"
          ? "SoundPath unreachable"
          : "Edit in SoundPath ↗"}
    </button>
  );
}
