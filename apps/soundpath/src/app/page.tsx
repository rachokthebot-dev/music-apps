"use client";

/**
 * SoundPath — gain alignment between Helix presets.
 *
 * Two preset slots:
 *   A — baseline preset: pick a baseline snapshot, align the other snapshots
 *       to it with per-snapshot dB targets.
 *   B — preset to align: same within-preset flow, plus "Align B to A" which
 *       shifts B's Output Block so B's baseline snapshot matches A's.
 *
 * Cross-preset math: the estimator never sees the Output Block, so each
 * pane's effective baseline loudness is rawLoudnessDb + outputGain. Aligning
 * stages a new Output Block gain on B (uniform shift — B's internal
 * snapshot-to-snapshot alignment is preserved) and Export writes it out.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { AppSwitcher } from "@music-apps/shared/app-switcher";
import PresetPane, { type PaneStatus } from "@/components/PresetPane";

const GAIN_MIN = -30;
const GAIN_MAX = 12;

export default function Home() {
  const [statusA, setStatusA] = useState<PaneStatus | null>(null);
  const [statusB, setStatusB] = useState<PaneStatus | null>(null);
  const [pendingGainA, setPendingGainA] = useState<number | null>(null);
  const [pendingGainB, setPendingGainB] = useState<number | null>(null);
  const [clampNote, setClampNote] = useState<string | null>(null);

  const onStatusA = useCallback((s: PaneStatus) => setStatusA(s), []);
  const onStatusB = useCallback((s: PaneStatus) => setStatusB(s), []);

  const bothLoaded = Boolean(statusA?.loaded && statusB?.loaded);

  // Effective baseline loudness per pane = raw estimate of the baseline
  // snapshot + Output Block gain (staged value wins over the loaded one).
  const effectiveDb = (status: PaneStatus, pendingGain: number | null): number =>
    (status.rawLoudness[status.baselineIndex] ?? 0) + (pendingGain ?? status.outputGain);

  const effA = statusA?.loaded ? effectiveDb(statusA, pendingGainA) : null;
  const effB = statusB?.loaded ? effectiveDb(statusB, pendingGainB) : null;
  const delta = effA !== null && effB !== null ? effA - effB : null;

  const handleAlignBtoA = useCallback(() => {
    if (!statusA?.loaded || !statusB?.loaded) return;
    const targetGain =
      effectiveDb(statusA, pendingGainA) - (statusB.rawLoudness[statusB.baselineIndex] ?? 0);
    const clamped = Math.max(GAIN_MIN, Math.min(GAIN_MAX, Number(targetGain.toFixed(1))));
    setPendingGainB(clamped);
    setClampNote(
      clamped !== Number(targetGain.toFixed(1))
        ? `Wanted ${targetGain.toFixed(1)} dB but the Output Block range is ${GAIN_MIN}…+${GAIN_MAX} dB — staged ${clamped.toFixed(1)} dB.`
        : null
    );
  }, [statusA, statusB, pendingGainA]);

  return (
    <main className="p-6 max-w-7xl mx-auto min-h-screen">
      <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">soundpath</h1>
          <p className="text-sm text-muted-foreground">Align gain between Helix presets.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/help" className="text-xs text-muted-foreground hover:text-foreground underline">
            Recording guide
          </Link>
          <AppSwitcher currentAppId="soundpath" />
        </div>
      </header>

      {/* Cross-preset alignment strip */}
      {bothLoaded && statusA && statusB && (
        <section className="mb-6 rounded-lg border border-violet-200 dark:border-violet-700/40 bg-violet-50/60 dark:bg-violet-950/15 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-6 flex-wrap text-sm">
              <span className="text-xs uppercase tracking-wider text-violet-700/80 dark:text-violet-300/80">
                Cross-preset alignment
              </span>
              <span className="text-muted-foreground">
                A baseline{" "}
                <span className="text-foreground tabular-nums">{effA!.toFixed(1)} dB</span>
              </span>
              <span className="text-muted-foreground">
                B baseline{" "}
                <span className="text-foreground tabular-nums">{effB!.toFixed(1)} dB</span>
              </span>
              <span className="text-muted-foreground">
                Δ{" "}
                <span
                  className={`tabular-nums font-medium ${
                    Math.abs(delta!) <= 0.5 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {delta! >= 0 ? "+" : ""}
                  {delta!.toFixed(1)} dB
                </span>
              </span>
            </div>
            <button
              onClick={handleAlignBtoA}
              disabled={Math.abs(delta!) <= 0.05}
              className="px-3 py-1.5 text-sm rounded-md border border-violet-300 dark:border-violet-700/50 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-100 hover:bg-violet-200 dark:hover:bg-violet-900/60 disabled:opacity-40"
            >
              Align B to A
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shifts B&apos;s Output Block uniformly — B&apos;s internal snapshot alignment is
            preserved. Estimates don&apos;t model cab/IR differences, so treat the staged value
            as a starting point and fine-tune by ear.
          </p>
          {clampNote && <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">{clampNote}</p>}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <PresetPane
          slot="a"
          label="Baseline preset (A)"
          pendingOutputGain={pendingGainA}
          onPendingOutputGainChange={setPendingGainA}
          onStatus={onStatusA}
        />
        <PresetPane
          slot="b"
          label="Preset to align (B)"
          pendingOutputGain={pendingGainB}
          onPendingOutputGainChange={setPendingGainB}
          onStatus={onStatusB}
        />
      </div>

      <footer className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground/70">
        v0.5 · Within-preset snapshot alignment + cross-preset baseline alignment · Export writes
        the .hlx
      </footer>
    </main>
  );
}
