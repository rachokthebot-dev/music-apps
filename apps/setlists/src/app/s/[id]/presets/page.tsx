"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WizardRail } from "@/components/WizardRail";

interface Match {
  id: string;
  name: string;
  band: string | null;
  song: string | null;
  amp: string | null;
  downloads: number;
  url: string | null;
  confidence: "song" | "band" | "none";
  warning?: string;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  presetChoice: string;
  presetName: string | null;
  presetUrl: string | null;
}

interface Setlist {
  id: string;
  name: string;
  songs: Song[];
}

export default function PresetsStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [matches, setMatches] = useState<Record<string, Match[]>>({});
  const [linkDraft, setLinkDraft] = useState<Record<string, string>>({});
  const [downloadError, setDownloadError] = useState<Record<string, string>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  /**
   * Typing a link is the choice — no separate confirm. The radio fills at once
   * so it doesn't feel unacknowledged, while the save is debounced so a URL
   * isn't PATCHed once per keystroke.
   */
  const typeLink = (songId: string, value: string) => {
    setLinkDraft((d) => ({ ...d, [songId]: value }));
    setSetlist((prev) =>
      prev
        ? {
            ...prev,
            songs: prev.songs.map((s) =>
              s.id === songId
                ? { ...s, presetChoice: value.trim() ? "link" : "none", presetUrl: value }
                : s
            ),
          }
        : prev
    );
    clearTimeout(saveTimers.current[songId]);
    saveTimers.current[songId] = setTimeout(() => {
      const trimmed = value.trim();
      fetch(`/setlists/api/songs/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          trimmed
            ? { presetChoice: "link", presetUrl: trimmed, presetName: "Pasted preset" }
            : { presetChoice: "none", presetUrl: null, presetName: null }
        ),
      })
        // Pasting a link only records the URL — the PATCH clears presetPath to
        // mark it stale and something else is expected to fetch it. Leaving
        // that to a later step is how a song reaches SoundPath with no preset
        // at all while this page still shows it as done, so fetch it here and
        // say so if it fails.
        .then((r) => {
          if (!r.ok || !trimmed) return null;
          return fetch(`/setlists/api/songs/${songId}/preset`, { method: "POST" });
        })
        .then(async (r) => {
          if (!r) return;
          const d = await r.json().catch(() => ({}));
          setDownloadError((prev) => ({
            ...prev,
            [songId]: r.ok && d?.error === undefined ? "" : String(d?.error ?? "Download failed"),
          }));
        })
        .catch((e) =>
          setDownloadError((prev) => ({ ...prev, [songId]: String(e?.message ?? e) }))
        );
    }, 600);
  };

  useEffect(() => {
    fetch(`/setlists/api/setlists/${id}`)
      .then((r) => r.json())
      .then((sl: Setlist) => {
        setSetlist(sl);
        sl.songs.forEach((s) => {
          fetch("/setlists/api/presets/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: s.title, artist: s.artist }),
          })
            .then((r) => r.json())
            .then((d) => setMatches((m) => ({ ...m, [s.id]: d.matches ?? [] })))
            .catch(() => setMatches((m) => ({ ...m, [s.id]: [] })));
        });
      })
      .catch(() => {});
  }, [id]);

  /** Attach a .hlx you already have — no ToneCloud URL needed. */
  const uploadPreset = async (songId: string, file: File) => {
    setUploading(songId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/setlists/api/songs/${songId}/preset/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        setUploadError((e) => ({ ...e, [songId]: d.error ?? "Upload failed" }));
        return;
      }
      setUploadError((e) => ({ ...e, [songId]: "" }));
      setSetlist((prev) =>
        prev
          ? {
              ...prev,
              songs: prev.songs.map((s) =>
                s.id === songId
                  ? { ...s, presetChoice: "upload", presetName: d.name, presetUrl: null }
                  : s
              ),
            }
          : prev
      );
    } finally {
      setUploading(null);
    }
  };

  const choose = async (songId: string, patch: Partial<Song>) => {
    setSetlist((prev) =>
      prev
        ? { ...prev, songs: prev.songs.map((s) => (s.id === songId ? { ...s, ...patch } : s)) }
        : prev
    );
    await fetch(`/setlists/api/songs/${songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  if (!setlist) return <div className="p-5 text-sm text-muted-foreground">Loading…</div>;

  const anyMatches = Object.values(matches).some((m) => m.length > 0);
  const loaded = Object.keys(matches).length === setlist.songs.length;
  const chosen = setlist.songs.filter((s) => s.presetChoice !== "none").length;

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto p-5">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Setlists
        </Link>
        <h1 className="text-lg font-semibold">{setlist.name}</h1>
      </header>

      <WizardRail setlistId={id} current="presets" />

      <div className="bg-card border border-border rounded-xl p-4 mb-3">
        <h2 className="text-[15px] font-semibold">Helix preset per song</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Matched against 8,917 indexed presets. Coverage depends on repertoire — classic and 90s
          rock match well, everything else rarely does.
        </p>
        {loaded && !anyMatches && (
          <p className="text-xs mt-2 px-2.5 py-2 rounded-lg bg-amber-500/10 text-amber-700">
            No song in this setlist matched a preset. The index is Western-rock heavy — paste or
            upload your own patches below, or skip this step entirely.
          </p>
        )}
      </div>

      {setlist.songs.map((s) => {
        const ms = matches[s.id];
        const top = ms?.[0];
        return (
          <div key={s.id} className="border border-border rounded-xl mb-3 bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-muted border-b border-border">
              <span className="font-bold text-sm">{s.title}</span>
              <span className="text-xs text-muted-foreground">{s.artist}</span>
              <span className="flex-1" />
              <a
                href={`/tones/?q=${encodeURIComponent(`${s.title} ${s.artist}`)}`}
                target="_blank"
                rel="noreferrer"
                title="Search the indexed preset catalog, then paste the link below"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"
              >
                search ToneCloud ↗
              </a>
              {ms && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    top?.confidence === "song"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : top?.confidence === "band"
                        ? "bg-amber-500/15 text-amber-700"
                        : "bg-muted-foreground/10 text-muted-foreground"
                  }`}
                >
                  {!top ? "no match" : top.confidence === "song" ? "song match" : "band only"}
                </span>
              )}
            </div>

            <div className="p-3">
              {top && (
                <button
                  onClick={() =>
                    choose(s.id, {
                      presetChoice: "matched",
                      presetName: top.name,
                      presetUrl: top.url,
                    })
                  }
                  className={`w-full flex items-center gap-2.5 p-2.5 border rounded-lg mb-1.5 text-left transition-colors ${
                    s.presetChoice === "matched"
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      s.presetChoice === "matched"
                        ? "border-violet-500 bg-violet-500 ring-2 ring-inset ring-background"
                        : "border-muted-foreground/30"
                    }`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-[13px] block truncate">{top.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {top.amp ?? "amp not listed"} · {top.downloads} downloads
                      {top.warning && <span className="text-amber-700"> · ⚠ {top.warning}</span>}
                    </span>
                  </span>
                </button>
              )}

              <button
                onClick={() =>
                  choose(s.id, { presetChoice: "none", presetName: null, presetUrl: null })
                }
                className={`w-full flex items-center gap-2.5 p-2.5 border rounded-lg mb-1.5 text-left transition-colors ${
                  s.presetChoice === "none"
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                    s.presetChoice === "none"
                      ? "border-violet-500 bg-violet-500 ring-2 ring-inset ring-background"
                      : "border-muted-foreground/30"
                  }`}
                />
                <span className="text-[13px]">None — skip this song</span>
              </button>

              <div
                onClick={() => fileInputs.current[s.id]?.click()}
                className={`flex items-center gap-2.5 p-2.5 border rounded-lg mb-1.5 cursor-pointer transition-colors ${
                  s.presetChoice === "upload"
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                    s.presetChoice === "upload"
                      ? "border-violet-500 bg-violet-500 ring-2 ring-inset ring-background"
                      : "border-muted-foreground/30"
                  }`}
                />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] block">
                    {uploading === s.id
                      ? "Reading…"
                      : s.presetChoice === "upload"
                        ? (s.presetName ?? "Uploaded preset")
                        : "Upload a .hlx"}
                  </span>
                  {uploadError[s.id] && (
                    <span className="text-[11px] text-destructive">{uploadError[s.id]}</span>
                  )}
                </span>
                <input
                  ref={(el) => {
                    fileInputs.current[s.id] = el;
                  }}
                  type="file"
                  accept=".hlx,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPreset(s.id, f);
                    e.target.value = "";
                  }}
                />
              </div>

              <div
                onClick={() => {
                  const el = document.getElementById(`link-${s.id}`) as HTMLInputElement | null;
                  el?.focus();
                }}
                className={`p-2.5 border rounded-lg cursor-text transition-colors ${
                  s.presetChoice === "link"
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      s.presetChoice === "link"
                        ? "border-violet-500 bg-violet-500 ring-2 ring-inset ring-background"
                        : "border-muted-foreground/30"
                    }`}
                  />
                  <span className="text-[13px]">Paste a ToneCloud link</span>
                </div>
                <input
                  id={`link-${s.id}`}
                  value={linkDraft[s.id] ?? s.presetUrl ?? ""}
                  onChange={(e) => typeLink(s.id, e.target.value)}
                  placeholder="https://line6.com/customtone/tone/…"
                  className="w-full mt-2 border border-border rounded-lg px-2.5 py-2 text-[12.5px] font-mono bg-background"
                />
                {(() => {
                  const v = (linkDraft[s.id] ?? s.presetUrl ?? "").trim();
                  if (!v) return null;
                  // The download step needs a numeric tone id out of the URL, so
                  // say up front when one isn't there rather than failing later.
                  if (downloadError[s.id]) {
                    // The preset itself failed to come down. Without this the
                    // row still reads as chosen and the song silently reaches
                    // SoundPath with nothing attached.
                    return (
                      <p className="text-[11px] text-rose-600 mt-1.5">
                        Preset not downloaded — {downloadError[s.id]}
                      </p>
                    );
                  }
                  return /customtone\/tone\/\d+/.test(v) ? (
                    <p className="text-[11px] text-emerald-700 mt-1.5">
                      {downloadError[s.id] === "" ? "Downloaded" : "Selected — downloads automatically"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-700 mt-1.5">
                      No tone id in that URL — expecting /customtone/tone/&lt;number&gt;/
                    </p>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">
          {chosen} of {setlist.songs.length} with a preset
        </span>
        <Link
          href={`/s/${id}/review`}
          className="bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5"
        >
          Review →
        </Link>
      </div>
    </div>
  );
}
