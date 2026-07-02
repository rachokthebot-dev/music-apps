"use client";

/**
 * Library — the catalog of AI-generated presets from SoundPath + HelAIx.
 *
 * Every Design Preset, applied Match Song / Tone Discovery, and preset ingested
 * from HelAIx lands here. From a saved row you can:
 *   • Download the .hlx
 *   • Open in editor  (loads it as the active master → tweak + Align Gain)
 *   • Iterate         (design flow only: re-run seeded from this record)
 *   • rename / favorite / delete
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSwitcher } from "@music-apps/shared/app-switcher";
import { Star, Download, Pencil, Trash2, SquarePen, RefreshCw } from "lucide-react";

type LoudnessRow = { index: number; name: string; loudnessDb: number };

type Preset = {
  id: string;
  name: string;
  sourceApp: string;
  flow: string;
  provider: string | null;
  model: string | null;
  hardwareTarget: string | null;
  favorite: boolean;
  parentId: string | null;
  createdAt: string;
  tones: unknown;
  snapshots: string[] | null;
  loudness: LoudnessRow[] | null;
};

type Filter = "all" | "favorite" | "soundpath" | "helaix";

const flowLabel: Record<string, string> = {
  design: "Design",
  "match-song": "Match Song",
  "tone-discovery": "Tone Discovery",
  helaix: "HelAIx",
};

export default function LibraryPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/soundpath/api/presets");
      const j = (await r.json()) as { ok: boolean; presets?: Preset[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "failed to load");
      setPresets(j.presets ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = presets.filter((p) => {
    if (filter === "all") return true;
    if (filter === "favorite") return p.favorite;
    return p.sourceApp === filter;
  });

  const toggleFavorite = async (p: Preset) => {
    setPresets((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, favorite: !x.favorite } : x))
    );
    await fetch(`/soundpath/api/presets/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !p.favorite }),
    });
  };

  const saveRename = async (id: string) => {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    setPresets((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)));
    await fetch(`/soundpath/api/presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  };

  const remove = async (p: Preset) => {
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    setPresets((prev) => prev.filter((x) => x.id !== p.id));
    await fetch(`/soundpath/api/presets/${p.id}`, { method: "DELETE" });
  };

  const openInEditor = async (p: Preset) => {
    setBusyId(p.id);
    setErr(null);
    try {
      const r = await fetch(`/soundpath/api/presets/${p.id}`);
      const j = (await r.json()) as { ok: boolean; preset?: { hlx?: string }; error?: string };
      if (!j.ok || !j.preset?.hlx) throw new Error(j.error ?? "could not load preset");
      const file = new File([j.preset.hlx], `${sanitize(p.name)}.hlx`, {
        type: "application/json",
      });
      const form = new FormData();
      form.append("file", file);
      const mr = await fetch("/soundpath/api/master", { method: "POST", body: form });
      const mj = (await mr.json()) as { ok: boolean; error?: string };
      if (!mj.ok) throw new Error(mj.error ?? "failed to load as master");
      router.push("/edit");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusyId(null);
    }
  };

  const iterate = (p: Preset) => {
    const tones = Array.isArray(p.tones) ? (p.tones as string[]) : [];
    const params = new URLSearchParams();
    tones.slice(0, 3).forEach((t, i) => params.set(`t${i}`, t));
    params.set("parentId", p.id);
    router.push(`/design?${params.toString()}`);
  };

  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="absolute top-4 right-4">
        <AppSwitcher currentAppId="soundpath" />
      </div>

      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Preset Library</h1>
          <p className="text-sm text-zinc-400">
            Every generated preset from SoundPath and HelAIx. Reopen, iterate, or re-download.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {(["all", "favorite", "soundpath", "helaix"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                filter === f
                  ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              {f === "all" ? "All" : f === "favorite" ? "★ Favorites" : f}
            </button>
          ))}
          <button
            onClick={load}
            className="ml-auto rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-700"
          >
            Refresh
          </button>
        </div>

        {err && (
          <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center">
            <p className="text-sm text-zinc-400">
              {filter === "all"
                ? "No saved presets yet. Design a preset or run Match Song to fill the Library."
                : "Nothing here for this filter."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {shown.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="mb-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {editingId === p.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => saveRename(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(p.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                      />
                    ) : (
                      <h2 className="truncate text-sm font-medium" title={p.name}>
                        {p.name}
                      </h2>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                      <Badge>{flowLabel[p.flow] ?? p.flow}</Badge>
                      <Badge>{p.sourceApp}</Badge>
                      {p.hardwareTarget && <Badge>{p.hardwareTarget}</Badge>}
                      {p.provider && <span>· {p.provider}</span>}
                      <span>· {new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFavorite(p)}
                    title={p.favorite ? "Unfavorite" : "Favorite"}
                    className={`shrink-0 rounded p-1 transition hover:bg-zinc-800 ${
                      p.favorite ? "text-amber-300" : "text-zinc-600"
                    }`}
                  >
                    <Star className="h-4 w-4" fill={p.favorite ? "currentColor" : "none"} />
                  </button>
                </div>

                {p.loudness && p.loudness.length > 0 && (
                  <p className="mb-3 text-[11px] text-zinc-500">
                    {p.loudness.length} snapshots · {loudnessRange(p.loudness)}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <a
                    href={`/soundpath/api/presets/${p.id}/download`}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    <Download className="h-3.5 w-3.5" /> .hlx
                  </a>
                  <button
                    onClick={() => openInEditor(p)}
                    disabled={busyId === p.id}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                    {busyId === p.id ? "Opening…" : "Open in editor"}
                  </button>
                  {p.flow === "design" && Array.isArray(p.tones) && (
                    <button
                      onClick={() => iterate(p)}
                      className="inline-flex items-center gap-1 rounded-md border border-purple-800/60 px-2.5 py-1 text-xs text-purple-200 hover:bg-purple-950/30"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Iterate
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditName(p.name);
                    }}
                    title="Rename"
                    className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    title="Delete"
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
      {children}
    </span>
  );
}

function loudnessRange(rows: LoudnessRow[]): string {
  const vals = rows.map((r) => r.loudnessDb);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
  return `${fmt(lo)}…${fmt(hi)} dB`;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "preset";
}
