"use client";

import Link from "next/link";

/**
 * Deep-practice technique sandbox index.
 *
 * Seven mockups, one per cognitive-flexibility technique from the source
 * brainstorm. Each is graded against a 5-dim rubric; survivors (≥ 3.5)
 * promote into production Shreddy in a follow-on planning round.
 *
 * See: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md
 * Gated by middleware.ts (SHREDDY_SANDBOX=1).
 */

const TECHNIQUES = [
  {
    slug: "ultra-slow",
    id: "R1",
    title: "Ultra-slow tempo",
    blurb: "Server-rendered tempo down to 0.10×. Tests the 50% rule.",
    status: "Phase 2",
  },
  {
    slug: "backward-chain",
    id: "R2",
    title: "Backward chaining",
    blurb: "Auto-drill from the last bar outward. Royer & Sinatra (1994).",
    status: "Phase 3",
  },
  {
    slug: "mental-rehearsal",
    id: "R3",
    title: "Mental rehearsal",
    blurb: "Silent visualization with metronome + guided cues. d=0.53.",
    status: "Phase 1",
  },
  {
    slug: "rhythmic-alternation",
    id: "R4",
    title: "Rhythmic alternation",
    blurb: "Dotted-feel + triplet metronome subdivisions.",
    status: "Phase 2",
  },
  {
    slug: "vocal-integration",
    id: "R5",
    title: "Vocal integration",
    blurb: "Stem mute/solo to sing the line. Cognitive-overload caveat.",
    status: "Phase 2",
  },
  {
    slug: "distraction",
    id: "R6",
    title: "Distraction overlay",
    blurb: "Dual-task practice. ⚠ Harms novices — advanced only.",
    status: "Phase 1",
  },
  {
    slug: "tone-variation",
    id: "R7",
    title: "Tone variation",
    blurb: "EQ presets. No published research — testing UX only.",
    status: "Phase 2",
  },
] as const;

export default function SandboxIndex() {
  return (
    <>
      <div className="h-1 w-full bg-[var(--sandbox-accent)]" aria-hidden />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:py-12">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--sandbox-accent)] font-mono mb-2">
            Deep-practice sandbox
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Seven techniques to grade
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Working mockups of cognitive-flexibility practice techniques. Each
            page is interactive end-to-end against a single stub song. Grade
            them in a single 90-minute session, then we promote the winners.
          </p>
        </header>

        <div className="space-y-3">
          {TECHNIQUES.map((t) => (
            <Link
              key={t.slug}
              href={`/sandbox/${t.slug}`}
              className="block p-4 bg-card border border-border rounded-xl hover:border-[var(--sandbox-accent)]/40 active:scale-[0.99] transition-all"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  <span className="text-muted-foreground font-mono mr-2">
                    {t.id}
                  </span>
                  {t.title}
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  {t.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t.blurb}</p>
            </Link>
          ))}
        </div>

        <footer className="mt-8 text-xs text-muted-foreground">
          Gated by <code className="font-mono">SHREDDY_SANDBOX=1</code>. Plan
          at{" "}
          <code className="font-mono">
            docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md
          </code>
          .
        </footer>
      </main>
    </>
  );
}
