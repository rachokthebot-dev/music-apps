"use client";

/**
 * The gig view.
 *
 * The preset view levels one patch against the target. This answers "does the
 * whole gig sit at one level" — from recordings of each preset, because a
 * modeller's loudness can't be predicted from its parameters.
 *
 * Without an ?id it lists the gigs it has and takes an .hls, the same shape the
 * preset view has: the tab you are on is where you start the thing that tab is
 * for, rather than being sent back to the library to begin.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSwitcher } from "@music-apps/shared/app-switcher";

import { ViewTabs } from "@/components/ViewTabs";
import { LevelPlan } from "@/components/LevelPlan";

interface SetlistRow {
  id: string;
  name: string;
  presets: number;
  measured: number;
  snapshots: number;
  updatedAt: string | null;
}

export default function SetlistPage() {
  // Reading ?id makes this page client-rendered; without the boundary the
  // build refuses to prerender it at all.
  return (
    <Suspense>
      <SetlistView />
    </Suspense>
  );
}

function SetlistView() {
  // The Setlists app links here with ?id=<setlist>, so the gig you were editing
  // is the one that loads — and the one its download button gets back.
  const router = useRouter();
  const id = useSearchParams().get("id");

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
          <button
            onClick={() => router.push("/setlist")}
            className="mb-3 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            ← every setlist
          </button>
          <LevelPlan setlistId={id} />
        </>
      ) : (
        <SetlistList />
      )}
    </main>
  );
}

function SetlistList() {
  const router = useRouter();
  const [setlists, setSetlists] = useState<SetlistRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/soundpath/api/library").then((r) => r.json());
    setSetlists(d.ok ? d.setlists : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** A .hls always starts a fresh session rather than replacing an open gig. */
  const uploadHls = async (file: File) => {
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const d = await fetch("/soundpath/api/setlist", { method: "POST", body: fd }).then((r) => r.json());
      if (!d.ok) throw new Error(d.error ?? "could not read that setlist");
      router.push(`/setlist?id=${encodeURIComponent(d.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  /**
   * Deleting a setlist throws away its recordings. They're keyed by preset
   * hash, so a patch that also lives in another gig keeps its reading there —
   * but this is the last copy for anything unique to this one.
   */
  const remove = async (s: SetlistRow) => {
    if (
      !window.confirm(
        `Delete "${s.name}"? Its ${s.measured} recording${s.measured === 1 ? "" : "s"} go with it.`
      )
    ) {
      return;
    }
    setBusy(`del:${s.id}`);
    try {
      await fetch(`/soundpath/api/setlist?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div>
          <h2 className="text-[15px] font-semibold">Setlists</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            A whole gig, levelled together against one target. Open one to record and download its
            .hls, or upload an .hls here to start a session.
          </p>
        </div>
        <label className="text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-secondary shrink-0">
          {busy === "upload" ? "Reading…" : "Upload .hls"}
          <input
            type="file"
            accept=".hls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadHls(f);
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

      {setlists === null ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : setlists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
          Nothing here yet. Send a gig over from the Setlists app, or upload an .hls to start a
          session.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {setlists.map((s) => {
            const done = s.snapshots > 0 && s.measured === s.snapshots;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 pr-2 rounded-lg border border-border hover:border-muted-foreground/40"
              >
                <Link
                  href={`/setlist?id=${encodeURIComponent(s.id)}`}
                  className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium block truncate">{s.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {s.presets} preset{s.presets === 1 ? "" : "s"}
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
                  title={`Delete "${s.name}" and its recordings`}
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
