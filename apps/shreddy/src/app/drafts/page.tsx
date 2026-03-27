"use client";

import Link from "next/link";

export default function DraftsIndex() {
  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-12">
      <h1 className="text-2xl font-semibold text-foreground mb-2">Practice Page Drafts</h1>
      <p className="text-sm text-muted-foreground mb-8">
        4 design options for the practice page. Tap to preview each one.
        All use mock data — no backend calls.
      </p>
      <div className="space-y-3">
        <Link
          href="/drafts/a"
          className="block p-4 bg-card border border-border rounded-xl hover:border-ring/30 transition-all"
        >
          <h2 className="text-base font-semibold text-foreground">A: Cinema Transport</h2>
          <p className="text-sm text-muted-foreground mt-1">
            2x taller waveform bar, tempo + pitch inline with transport, less card clutter
          </p>
        </Link>
        <Link
          href="/drafts/b"
          className="block p-4 bg-card border border-border rounded-xl hover:border-ring/30 transition-all"
        >
          <h2 className="text-base font-semibold text-foreground">B: Dashboard Panels</h2>
          <p className="text-sm text-muted-foreground mt-1">
            3-column grid, borderless tinted panels, mastery progress bars instead of stars
          </p>
        </Link>
        <Link
          href="/drafts/c"
          className="block p-4 bg-card border border-border rounded-xl hover:border-ring/30 transition-all"
        >
          <h2 className="text-base font-semibold text-foreground">C: Floating Player</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Dark player card, horizontal section strip, all controls in one row
          </p>
        </Link>
        <Link
          href="/drafts/d"
          className="block p-4 bg-card border border-border rounded-xl hover:border-ring/30 transition-all"
        >
          <h2 className="text-base font-semibold text-foreground">D: Studio Mixer</h2>
          <p className="text-sm text-muted-foreground mt-1">
            No cards — horizontal strips, 96px section bar IS the selector, everything in one viewport
          </p>
        </Link>
      </div>
    </main>
  );
}
