"use client";

/**
 * The library — what SoundPath has stored, and the only way in.
 *
 * Two kinds of thing live here and they behave differently on click, so they
 * get their own sections: a setlist opens the gig view, a preset opens a
 * levelling session of its own. Most presets have nothing to do with any
 * setlist — they arrive from HelAIx or a past generation.
 *
 * Nothing is loaded until you pick it, because a remembered one meant opening
 * the app dropped you into whatever you last touched — the easiest way to
 * record against the wrong thing.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SidebarMenuButton } from "@music-apps/shared/app-shell";
import { XIcon } from "@phosphor-icons/react";

import { Shell } from "@/components/Shell";

interface SetlistRow {
  id: string;
  name: string;
  presets: number;
  measured: number;
  snapshots: number;
  updatedAt: string | null;
}

/**
 * A preset from either source, already flattened by the API. `key` is
 * "hash:<h>" for a patch stored inside a setlist or "id:<id>" for a row in the
 * generated-preset table — the opener takes both.
 */
interface PresetRow {
  key: string;
  name: string;
  origin: string;
  updatedAt: string | null;
  /** What that date is — a reading, or the patch arriving. */
  updatedWhat: "recorded" | "added" | null;
  measuredAt: string | null;
  addedAt: string | null;
  deletable: boolean;
  /** Null when nothing has read this patch's snapshots yet. */
  measured: number | null;
  snapshots: number | null;
}

/**
 * Date and time, always both.
 *
 * A bare "4:02 PM" reads as today whatever day it came from, and two setlists
 * of the same name are told apart by exactly this column.
 */
function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function Library() {
  const router = useRouter();
  const [setlists, setSetlists] = useState<SetlistRow[] | null>(null);
  const [presets, setPresets] = useState<PresetRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/soundpath/api/library").then((r) => r.json());
    setSetlists(d.ok ? d.setlists : []);
    setPresets(d.ok ? d.presets : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Deleting a setlist throws away its recordings. They're keyed by preset
   * hash, so a patch that also lives in another gig keeps its reading there —
   * but this is the last copy for anything unique to this one.
   */
  const removeSetlist = async (s: SetlistRow) => {
    if (
      !window.confirm(
        `Delete "${s.name}"? Its ${s.measured} recording${s.measured === 1 ? "" : "s"} go with it.`
      )
    ) {
      return;
    }
    setBusy(`del:${s.id}`);
    setError(null);
    try {
      await fetch(`/soundpath/api/setlist?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const removePreset = async (p: PresetRow) => {
    if (!window.confirm(`Delete "${p.name}" from the library?`)) return;
    setBusy(`del:${p.key}`);
    setError(null);
    try {
      const id = p.key.slice(p.key.indexOf(":") + 1);
      await fetch(`/soundpath/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Open a levelling session for one patch.
   *
   * Idempotent, and keyed on the preset's own bytes rather than which listing
   * it came from — so the same patch reached from a setlist and from the
   * generated table is one session carrying one set of readings.
   */
  const levelPreset = async (key: string) => {
    setBusy(key);
    setError(null);
    try {
      const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      const r = await fetch(`/soundpath/api/level`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "hash" ? { presetHash: value } : { presetId: value }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "could not open that preset");
      router.push(`/level?id=${encodeURIComponent(d.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  return (
    <Shell>
    <main className="w-full px-4 lg:px-8 py-4 lg:py-6 max-w-4xl mx-auto">
      <header className="mb-6 flex items-center gap-1">
        <SidebarMenuButton />
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      </header>

      {error && (
        <p className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-2xl font-semibold tracking-tight">Setlists</h2>
          <p className="text-sm text-muted-foreground mt-1">
            A whole gig, levelled from recordings. Open one to record and download its .hls —
            uploading one starts from the{" "}
            <Link href="/setlist" className="underline hover:text-foreground">
              Setlist
            </Link>{" "}
            tab.
          </p>
        </div>

        {setlists === null ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : setlists.length === 0 ? (
          <Empty>
            Nothing here yet. Send a gig over from the Setlists app, or upload an .hls on the
            Setlist tab to start a session.
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {setlists.map((s) => (
              <LibraryRow
                key={s.id}
                title={s.name}
                subtitle={`${s.presets} preset${s.presets === 1 ? "" : "s"}`}
                hint={s.id}
                updatedAt={s.updatedAt}
                measured={s.measured}
                total={s.snapshots}
                busy={false}
                onOpen={() => router.push(`/setlist?id=${encodeURIComponent(s.id)}`)}
                right={
                  <DeleteButton
                    onClick={() => removeSetlist(s)}
                    disabled={busy !== null}
                    busy={busy === `del:${s.id}`}
                    title={`Delete "${s.name}" and its recordings`}
                  />
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Presets</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          Every patch stored here, whether or not it belongs to a gig. Open one to record it on its
          own, against the same target a setlist levels to.
        </p>

        {presets === null ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : presets.length === 0 ? (
          <Empty>No presets stored. They arrive from HelAIx, or from a generation here.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {presets.map((p) => (
              <LibraryRow
                key={p.key}
                title={p.name}
                subtitle={p.origin}
                updatedAt={p.updatedAt}
                updatedLabel={p.updatedWhat}
                hint={
                  [
                    p.measuredAt && `last recorded ${new Date(p.measuredAt).toLocaleString()}`,
                    p.addedAt && `added ${new Date(p.addedAt).toLocaleString()}`,
                  ]
                    .filter(Boolean)
                    .join("\n") || undefined
                }
                measured={p.measured}
                total={p.snapshots}
                busy={busy === p.key}
                onOpen={() => levelPreset(p.key)}
                right={
                  p.deletable ? (
                    <DeleteButton
                      onClick={() => removePreset(p)}
                      disabled={busy !== null}
                      busy={busy === `del:${p.key}`}
                      title={`Delete "${p.name}" from the library`}
                    />
                  ) : (
                    // Placeholder keeps the buttons in one column; this patch
                    // lives inside its setlist, so it goes when that does.
                    <span
                      className="w-11 shrink-0 text-center text-muted-foreground/25 text-sm"
                      title={`Stored inside ${p.origin} — delete that setlist to remove it`}
                    >
                      ·
                    </span>
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
    </main>
    </Shell>
  );
}

/**
 * One thing in the library.
 *
 * Setlists and presets are the same shape of row on purpose — a name, where it
 * came from, when it last moved, how much of it is recorded — so they share
 * one component rather than two that drift.
 */
function LibraryRow({
  title,
  subtitle,
  hint,
  updatedAt,
  updatedLabel,
  measured,
  total,
  busy,
  onOpen,
  right,
}: {
  title: string;
  subtitle: string;
  /** Shown on hover — the id, or wherever the patch is stored. */
  hint?: string;
  updatedAt: string | null;
  /** Prefixes the date, so "Aug 3" isn't left meaning whatever you assume. */
  updatedLabel?: string | null;
  measured: number | null;
  total: number | null;
  busy: boolean;
  onOpen: () => void;
  right: React.ReactNode;
}) {
  const known = measured !== null && total !== null && total > 0;
  const done = known && measured === total;

  return (
    <li
      className="flex items-center gap-3 pr-2 rounded-3xl bg-card border border-border hover:bg-muted/40 transition-colors"
      title={hint}
    >
      <button
        onClick={onOpen}
        disabled={busy}
        className="flex-1 min-w-0 flex items-center gap-3 px-5 py-3.5 text-left active:scale-[0.99] transition-transform duration-300 ease-spring disabled:opacity-50"
      >
        <span className="flex-1 min-w-0">
          <span className="text-base font-semibold block truncate">{title}</span>
          <span className="text-sm text-muted-foreground block truncate">{subtitle}</span>
        </span>
        {/* Hidden on a phone. The name is the thing you are scanning for, and
            a fixed date column plus the badge left it squeezed to nothing. */}
        <span
          className="hidden sm:block text-sm text-muted-foreground tabular-nums shrink-0"
          title={updatedAt ? new Date(updatedAt).toLocaleString() : undefined}
        >
          {busy ? "opening…" : `${updatedLabel ? updatedLabel + " " : ""}${when(updatedAt)}`}
        </span>
        {/* Reserved at width from sm up, so the two lists line up even when a
            patch has nothing to report yet. */}
        <span className="sm:w-32 shrink-0 text-right">
          {known && (
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                done ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
              }`}
            >
              {measured}/{total} measured
            </span>
          )}
        </span>
      </button>
      {right}
    </li>
  );
}

function DeleteButton({
  onClick,
  disabled,
  busy,
  title,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="size-11 shrink-0 grid place-items-center rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all disabled:opacity-30"
    >
      {busy ? "…" : <XIcon className="size-5" />}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
