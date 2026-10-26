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
import { SidebarMenuButton } from "@music-apps/shared/app-shell";
import { UploadSimpleIcon, XIcon } from "@phosphor-icons/react";

import { Shell } from "@/components/Shell";
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
    <Shell>
    <main className="w-full px-4 lg:px-8 py-4 lg:py-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center gap-1">
        <SidebarMenuButton />
        <h1 className="text-2xl font-semibold tracking-tight">Setlist</h1>
      </header>

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
    </Shell>
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
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Setlists</h2>
          <p className="text-sm text-muted-foreground mt-1">
            A whole gig, levelled together against one target. Open one to record and download its
            .hls, or upload an .hls here to start a session.
          </p>
        </div>
        <label className="h-12 px-5 rounded-full bg-primary text-primary-foreground flex items-center gap-2 text-sm font-semibold cursor-pointer active:scale-95 transition-all duration-200 ease-spring shrink-0">
          <UploadSimpleIcon className="size-5" />
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
        <p className="mb-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {setlists === null ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : setlists.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Send a gig over from the Setlists app, or upload an .hls to start a
          session.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {setlists.map((s) => {
            const done = s.snapshots > 0 && s.measured === s.snapshots;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 pr-2 rounded-3xl bg-card border border-border hover:bg-muted/40 transition-colors"
              >
                <Link
                  href={`/setlist?id=${encodeURIComponent(s.id)}`}
                  className="flex-1 min-w-0 flex items-center gap-3 px-5 py-3.5 active:scale-[0.99] transition-transform duration-300 ease-spring"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-base font-semibold block truncate">{s.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {s.presets} preset{s.presets === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
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
                  className="size-11 shrink-0 grid place-items-center rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all disabled:opacity-30"
                >
                  {busy === `del:${s.id}` ? "…" : <XIcon className="size-5" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
