// Module-singleton AudioContext for Shreddy.
//
// Why module-singleton:
//   * iPad Safari caps the number of AudioContexts a page can hold (and
//     closes the oldest when you exceed it). Practice page features —
//     metronome, future stems engine, pitch shifter rendering, distraction
//     overlay (no audio yet) — must share one context, not allocate their
//     own.
//   * AudioContext.close() destroys the context permanently. Hook unmounts
//     should suspend (sleep), not close, so the next navigation can resume
//     the same context without paying re-init cost.
//
// Sample rate is fixed at 32kHz: the metronome only needs 800–1000Hz clicks,
// and a 32kHz context lowers per-stem memory budget on the future
// 4-stems-decoded path (~73MB → ~53MB per minute of 4-stem audio). The
// browser will resample any decoded audio to the context rate automatically.

const SAMPLE_RATE = 32_000;

let ctx: AudioContext | null = null;

/**
 * Return the app's shared AudioContext, constructing it lazily on first call.
 * Caller must trigger this from a user gesture (tap/click handler) on iPad
 * Safari — otherwise the context will start `suspended` and need an explicit
 * `resume()` later.
 */
export function getAudioContext(): AudioContext {
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  // Safari < 14.1 rejects unknown options and throws. Try the modern signature
  // first and fall back without options if construction fails.
  try {
    ctx = new Ctor({ sampleRate: SAMPLE_RATE });
  } catch {
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Suspend (not close) the shared context. Use from feature hooks on unmount
 * so the slot stays reusable across page navigations.
 */
export async function suspendAudioContext(): Promise<void> {
  if (!ctx || ctx.state === "closed" || ctx.state === "suspended") return;
  try {
    await ctx.suspend();
  } catch {
    // Some Safari versions reject suspend() on contexts that were never
    // resumed. Ignore — the context will stay in its current state.
  }
}
