"use client";

/**
 * The single-preset view.
 *
 * The setlist view answers "does the whole gig sit at one level". This answers
 * the same question for one patch that belongs to no gig — something from
 * HelAIx, or a generation here — so it can be dropped into a setlist later
 * already at the right level.
 *
 * Without an ?id it lists the sessions you have open, because a preset session
 * outlives a visit: readings are kept against the patch's hash, so coming back
 * to one you half-recorded picks up where you left off.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSwitcher } from "@music-apps/shared/app-switcher";

import { PresetLevel } from "@/components/PresetLevel";
import { ViewTabs } from "@/components/ViewTabs";

interface SessionRow {
  id: string;
  name: string;
  measured: number;
  snapshots: number;
  versions: number;
  updatedAt: string | null;
}

export default function PresetLevelPage() {
  // Reading ?id makes this page client-rendered; without the boundary the
  // build refuses to prerender it at all.
  return (
    <Suspense>
      <PresetLevelView />
    </Suspense>
  );
}

function PresetLevelView() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  // Set when you arrived from a gig, so there's a way back to it — and a
  // reminder that the readings are wanted somewhere.
  const from = params.get("from");

  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen">
      <header className="mb-4 flex items-baseline justify-between gap-4 flex-wrap">
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

      <ViewTabs />

      {id ? (
        <>
          <div className="mb-3 flex items-center gap-4">
            <button
              onClick={() => router.push("/level")}
              className="text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              ← every preset
            </button>
            {from && <BackToSetlist id={from} />}
          </div>
          <PresetLevel presetId={id} />
        </>
      ) : (
        <SessionList />
      )}
    </main>
  );
}

/**
 * The way back to the gig you came from.
 *
 * Named, not just "back": you opened this to fix one song in a particular
 * setlist, and the readings are wanted there rather than here.
 */
function BackToSetlist({ id }: { id: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/soundpath/api/setlist/plan?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d?.ok) setName(d.name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <Link
      href={`/setlist?id=${encodeURIComponent(id)}`}
      className="text-[11.5px] font-semibold text-violet-500 hover:underline"
      title="Once this preset is recorded, its readings are offered on that setlist's row"
    >
      ← back to {name ?? "the setlist"}
    </Link>
  );
}

function SessionList() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/soundpath/api/level").then((r) => r.json());
    setSessions(d.ok ? d.sessions : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadHlx = async (file: File) => {
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const d = await fetch("/soundpath/api/level", { method: "POST", body: fd }).then((r) => r.json());
      if (!d.ok) throw new Error(d.error ?? "could not read that preset");
      router.push(`/level?id=${encodeURIComponent(d.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const remove = async (s: SessionRow) => {
    if (!window.confirm(`Drop the levelling session for "${s.name}"? Its ${s.measured} recording${s.measured === 1 ? "" : "s"} go with it.`)) {
      return;
    }
    setBusy(`del:${s.id}`);
    try {
      await fetch(`/soundpath/api/level?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div>
          <h2 className="text-[15px] font-semibold">Presets being levelled</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            One patch at a time, against the same target a gig uses. Start one from the{" "}
            <Link href="/" className="underline hover:text-foreground">
              library
            </Link>
            , or drop an .hlx here.
          </p>
        </div>
        <label className="text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-secondary shrink-0">
          {busy === "upload" ? "Reading…" : "Upload .hlx"}
          <input
            type="file"
            accept=".hlx,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadHlx(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}

      {sessions === null ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
          Nothing open. Pick a preset in the library and press <b>level</b>.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.map((s) => {
            const done = s.snapshots > 0 && s.measured === s.snapshots;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 pr-2 rounded-lg border border-border hover:border-muted-foreground/40"
              >
                <Link
                  href={`/level?id=${encodeURIComponent(s.id)}`}
                  className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium block truncate">{s.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {s.versions > 0
                        ? `${s.versions} confirmed version${s.versions === 1 ? "" : "s"}`
                        : "no confirmed version yet"}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      done ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                    }`}
                  >
                    {s.measured}/{s.snapshots} measured
                  </span>
                </Link>
                <button
                  onClick={() => remove(s)}
                  disabled={busy !== null}
                  title={`Drop the session for "${s.name}"`}
                  className="w-7 h-7 shrink-0 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                >
                  {busy === `del:${s.id}` ? "…" : "✕"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
