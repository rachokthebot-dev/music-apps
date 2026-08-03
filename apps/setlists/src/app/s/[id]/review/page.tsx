"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WizardRail } from "@/components/WizardRail";

interface Song {
  id: string;
  title: string;
  artist: string;
  lickbankVideoUrl: string | null;
  lickbankSourceId: string | null;
  shreddyVideoUrl: string | null;
  shreddySongId: string | null;
  presetChoice: string;
  presetName: string | null;
  /** Null until the preset has actually been fetched, whatever the name says. */
  presetPath: string | null;
  importStatus: string;
  importError: string | null;
}

interface Setlist {
  id: string;
  name: string;
  songs: Song[];
}

interface RunState {
  status: string;
  total?: number;
  completed?: number;
  currentTitle?: string;
  message?: string;
  log?: string[];
}

export default function ReviewStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [sl, setSl] = useState<Setlist | null>(null);
  const [run, setRun] = useState<RunState>({ status: "idle" });

  const load = useCallback(async () => {
    const r = await fetch(`/setlists/api/setlists/${id}`);
    setSl(await r.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while a run is in flight; each import is a video download, so this
  // takes minutes rather than seconds.
  useEffect(() => {
    if (run.status !== "running") return;
    const t = setInterval(async () => {
      const r = await fetch(`/setlists/api/setlists/${id}/run`);
      const s: RunState = await r.json();
      setRun(s);
      if (s.status !== "running") {
        load();
        // The run is the last thing the wizard does — land on the setlist,
        // where the files and the practice links are.
        if (s.status === "done") router.push(`/s/${id}`);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [run.status, id, load, router]);

  const start = async () => {
    const res = await fetch(`/setlists/api/setlists/${id}/run`, { method: "POST" });
    if (res.ok) setRun({ status: "running", completed: 0, total: sl?.songs.length });
  };

  if (!sl) return <div className="p-5 text-sm text-muted-foreground">Loading…</div>;

  const toImport = sl.songs.filter((s) => s.lickbankVideoUrl || s.shreddyVideoUrl).length;

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto p-5">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Setlists
        </Link>
        <h1 className="text-lg font-semibold">{sl.name}</h1>
      </header>

      <WizardRail setlistId={id} current="review" />

      <div className="bg-card border border-border rounded-xl overflow-hidden mb-3">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left">Song</th>
              <th className="text-left">LickBank</th>
              <th className="text-left">Shreddy</th>
              <th className="text-left">Helix</th>
              <th className="text-left">State</th>
            </tr>
          </thead>
          <tbody>
            {sl.songs.map((s, i) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="font-medium">
                  {s.title}
                  <div className="text-[11px] text-muted-foreground font-normal">{s.artist}</div>
                </td>
                <td className={s.lickbankVideoUrl ? "" : "text-muted-foreground/50"}>
                  {s.lickbankSourceId ? "imported" : s.lickbankVideoUrl ? "queued" : "—"}
                </td>
                <td className={s.shreddyVideoUrl ? "" : "text-muted-foreground/50"}>
                  {s.shreddySongId ? "imported" : s.shreddyVideoUrl ? "queued" : "—"}
                </td>
                <td className={s.presetChoice === "none" ? "text-muted-foreground/50" : ""}>
                  {s.presetChoice === "none" ? (
                    "—"
                  ) : s.presetPath ? (
                    (s.presetName ?? s.presetChoice)
                  ) : (
                    // Chosen but never fetched. This column used to show the
                    // name either way, so a song with no preset at all read as
                    // ready — and then vanished from the hand-off to SoundPath
                    // without a word.
                    <span className="text-amber-600" title="Chosen, but the preset file was never downloaded">
                      {s.presetName ?? s.presetChoice} — not downloaded ⚠
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      s.importStatus === "done"
                        ? "bg-emerald-500/15 text-emerald-700"
                        : s.importStatus === "error"
                          ? "bg-destructive/15 text-destructive"
                          : s.importStatus === "running"
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.importStatus}
                  </span>
                  {s.importError && (
                    <div className="text-[10.5px] text-destructive mt-0.5">{s.importError}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {run.status === "running" && (
        <div className="bg-card border border-amber-500/40 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold">
              Importing… {run.completed ?? 0} of {run.total ?? "?"}
            </span>
            {run.currentTitle && (
              <span className="text-xs text-muted-foreground">{run.currentTitle}</span>
            )}
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${((run.completed ?? 0) / (run.total || 1)) * 100}%` }}
            />
          </div>
          {run.log && run.log.length > 0 && (
            <div className="mt-3 text-[11.5px] text-muted-foreground font-mono max-h-32 overflow-y-auto">
              {run.log.slice(-8).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {run.status === "done" && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-3 mb-3 text-[13px] text-emerald-800">
          Import finished. Videos keep processing inside Shreddy and LickBank for a few minutes.
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {toImport} of {sl.songs.length} songs have a video to import
        </span>
        <div className="flex gap-2">
          <Link
            href={`/s/${id}`}
            className="text-sm font-semibold px-4 py-2.5 rounded-lg border border-border"
          >
            Saved setlist
          </Link>
          <button
            onClick={start}
            disabled={run.status === "running" || toImport === 0}
            className="bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5 disabled:opacity-50"
          >
            {run.status === "running" ? "Running…" : "Run all →"}
          </button>
        </div>
      </div>
    </div>
  );
}
