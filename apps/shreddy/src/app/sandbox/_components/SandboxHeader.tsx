"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Per-page sandbox chrome.
 *
 * Visual marker that distinguishes the sandbox from production Shreddy:
 *   - 1px top seam in --sandbox-accent
 *   - Small uppercase tag with R-id + technique name
 *   - Back link to /sandbox index
 *
 * Kept inline rather than as a SandboxFrame layout component because the
 * simplification reviewer flagged the abstraction tax for 10 lines of header.
 */
export interface SandboxHeaderProps {
  technique: string;
  requirementId: `R${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
}

export function SandboxHeader({ technique, requirementId }: SandboxHeaderProps) {
  return (
    <>
      <div className="h-1 w-full bg-[var(--sandbox-accent)]" aria-hidden />
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <Link
          href="/sandbox"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground active:scale-95 transition"
        >
          <ChevronLeft className="size-4" />
          Sandbox
        </Link>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--sandbox-accent)] font-mono">
          {requirementId} — {technique}    SANDBOX
        </div>
        <div className="w-12" aria-hidden />
      </header>
    </>
  );
}
