"use client";

import { useEffect, useState } from "react";

export interface Candidate {
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSec: number | null;
  chapterCount?: number;
  hasSolo?: boolean;
  score: number;
  reasons: string[];
}

interface ExistingItem {
  app: string;
  id: string;
  title: string;
  url: string;
}

function fmtDur(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPicker({
  songId,
  title,
  artist,
  lane,
  selectedUrl,
  onSelect,
}: {
  songId: string;
  title: string;
  artist: string;
  lane: "lesson" | "track";
  selectedUrl: string | null;
  onSelect: (url: string | null) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [existing, setExisting] = useState<ExistingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/setlists/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist, lane }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else {
          setCandidates(d.candidates ?? []);
          setExisting(d.existing ?? []);
        }
      })
      .catch(() => !cancelled && setError("Search failed"));
    return () => {
      cancelled = true;
    };
  }, [title, artist, lane]);

  return (
    <div className="border border-border rounded-xl mb-3 overflow-hidden bg-card">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-muted border-b border-border">
        <span className="font-bold text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">{artist}</span>
        <span className="flex-1" />
        {existing.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
            already imported
          </span>
        )}
      </div>

      <div className="p-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!candidates && !error && (
          <p className="text-sm text-muted-foreground py-3">Searching YouTube…</p>
        )}

        {preview && (
          <div className="mb-3 rounded-lg overflow-hidden border border-border bg-black aspect-video">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${preview}`}
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {candidates?.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Nothing usable found — every result was the wrong kind of video.
          </p>
        )}

        {candidates?.map((c) => {
          const sel = selectedUrl === c.url;
          return (
            <div
              key={c.id}
              onClick={() => onSelect(sel ? null : c.url)}
              className={`flex items-center gap-2.5 p-2 border rounded-lg mb-1.5 cursor-pointer transition-colors ${
                sel
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                  sel ? "border-emerald-500 bg-emerald-500 ring-2 ring-inset ring-background" : "border-muted-foreground/30"
                }`}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(preview === c.id ? null : c.id);
                }}
                className="w-[74px] h-[42px] rounded-md bg-neutral-800 grid place-items-center shrink-0 text-white text-[11px] hover:bg-neutral-700"
                title="Preview"
              >
                ▶ {fmtDur(c.durationSec)}
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] truncate">{c.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{c.channel}</span>
                  {c.chapterCount !== undefined &&
                    (c.chapterCount > 0 ? (
                      <span className="font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700">
                        {c.chapterCount} chapters{c.hasSolo ? " · Solo" : ""}
                      </span>
                    ) : (
                      <span className="font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        no chapters
                      </span>
                    ))}
                  {c.reasons.slice(0, 2).map((r) => (
                    <span key={r} className="text-muted-foreground/70">
                      · {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* A peer of the candidates, not a footnote: "no video" is a real
            choice here, and with null as the default it needs its own radio or
            you can't tell "skipped" from "not looked at yet". */}
        <div
          onClick={() => onSelect(null)}
          className={`flex items-center gap-2.5 p-2 border rounded-lg cursor-pointer transition-colors ${
            selectedUrl === null
              ? "border-muted-foreground/40 bg-muted"
              : "border-border hover:border-muted-foreground/40"
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full border-2 shrink-0 ${
              selectedUrl === null
                ? "border-muted-foreground bg-muted-foreground ring-2 ring-inset ring-background"
                : "border-muted-foreground/30"
            }`}
          />
          <span className="w-[74px] h-[42px] rounded-md bg-muted grid place-items-center shrink-0 text-muted-foreground text-[15px]">
            —
          </span>
          <span className="flex-1 min-w-0">
            <span className="font-semibold text-[13px] block">Skip this song</span>
            <span className="text-[11px] text-muted-foreground">
              nothing imported for this lane
            </span>
          </span>
        </div>
        <span className="sr-only">{songId}</span>
      </div>
    </div>
  );
}
