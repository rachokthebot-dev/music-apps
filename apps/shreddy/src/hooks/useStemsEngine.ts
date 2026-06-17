"use client";

// React adapter for the StemsEngine.
//
// Owns:
//   * Polling /api/songs/[id]/stems until state="ready" (and only then —
//     before that, returns { ready: false } and the page stays on the
//     audio-element path).
//   * Lazy construction of the engine on first activation. The engine
//     loads ~252MB of decoded audio into the shared AudioContext, so we
//     defer until the user actually mutes a stem.
//   * Dispose on unmount (releases the buffers, disconnects the gain
//     nodes from ctx.destination — the AudioContext itself stays alive
//     for the metronome / next page).
//
// What this hook does NOT do:
//   * Manage transport (play/pause/seek) — the caller drives those.
//   * Render UI — the StemMixer pills component is separate.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createStemsEngine,
  STEM_NAMES,
  type StemName,
  type StemsEngine,
  type StemUrls,
} from "@/lib/stems-engine";

interface StemsStatusResponse {
  state: "pending" | "processing" | "ready" | "error";
  errorMessage: string | null;
  stems?: StemUrls;
}

interface UseStemsEngineOptions {
  songId: string | null;
}

interface UseStemsEngineResult {
  /** True once the server has rendered all 4 stems and the URLs are known. */
  ready: boolean;
  /** Server-reported pipeline state (pending / processing / ready / error). */
  state: StemsStatusResponse["state"] | "unknown";
  /** Live engine handle once it's been activated. Null until the first
   *  activate() call. Calling code uses this for play/pause/seek/mute. */
  engine: StemsEngine | null;
  /** Per-stem mute state. Mirror of what's been pushed to the engine. */
  muted: Record<StemName, boolean>;
  /** Activate the engine — loads buffers and constructs sources lazily.
   *  Returns the engine on success, or null if stems aren't ready yet. */
  activate: () => Promise<StemsEngine | null>;
  /** Mute setter — ramps gain and updates muted state. */
  setMute: (stem: StemName, m: boolean) => void;
}

// Status polling cadence while pipeline is processing. Cheap query (single
// row SELECT) so 4s feels live enough without spamming.
const POLL_INTERVAL_MS = 4000;

export function useStemsEngine({ songId }: UseStemsEngineOptions): UseStemsEngineResult {
  const [status, setStatus] = useState<StemsStatusResponse | null>(null);
  const [engine, setEngine] = useState<StemsEngine | null>(null);
  const [muted, setMutedState] = useState<Record<StemName, boolean>>(() =>
    Object.fromEntries(STEM_NAMES.map((s) => [s, false])) as Record<StemName, boolean>
  );

  // Refs for the pollers so we never close over stale state.
  const statusRef = useRef<StemsStatusResponse | null>(null);
  statusRef.current = status;
  const engineRef = useRef<StemsEngine | null>(null);
  engineRef.current = engine;

  // Poll for stems readiness. Stops once state="ready" or "error".
  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/songs/${songId}/stems`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as StemsStatusResponse;
        if (cancelled) return;
        setStatus(json);
        if (json.state !== "ready" && json.state !== "error") {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch {
        if (cancelled) return;
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [songId]);

  // Dispose engine on unmount or song change.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      setEngine(null);
    };
  }, [songId]);

  const activate = useCallback(async (): Promise<StemsEngine | null> => {
    if (engineRef.current) return engineRef.current;
    const s = statusRef.current;
    if (!s || s.state !== "ready" || !s.stems) return null;
    const newEngine = createStemsEngine();
    await newEngine.load(s.stems);
    // Replay any mute state the user toggled before activation finished.
    for (const stem of STEM_NAMES) {
      if (muted[stem]) newEngine.setMute(stem, true);
    }
    engineRef.current = newEngine;
    setEngine(newEngine);
    return newEngine;
    // muted is intentionally read once at activation — runtime mute changes
    // go through setMute() below, which calls engine.setMute() directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMute = useCallback((stem: StemName, m: boolean) => {
    setMutedState((prev) => (prev[stem] === m ? prev : { ...prev, [stem]: m }));
    engineRef.current?.setMute(stem, m);
  }, []);

  return {
    ready: status?.state === "ready",
    state: status?.state ?? "unknown",
    engine,
    muted,
    activate,
    setMute,
  };
}
