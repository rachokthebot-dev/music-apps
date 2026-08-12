"use client";

import { useState } from "react";

export interface SearchCandidate {
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSec: number | null;
  chapterCount?: number;
  hasSolo?: boolean;
  tooLong?: boolean;
  score: number;
  reasons: string[];
}

function fmtDur(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/**
 * One field for both ways in: type words to search YouTube and pick from
 * ranked results, or paste a link and skip the search entirely.
 */
export function YouTubeSearchPanel({
  endpoint,
  selectedUrl,
  onSelect,
  onSubmit,
  disabled = false,
  limitLabel,
}: {
  /** basePath-prefixed search route, e.g. "/shreddy/api/youtube-search". */
  endpoint: string;
  selectedUrl: string;
  onSelect: (url: string) => void;
  /** Enter on a pasted link imports straight away. */
  onSubmit?: () => void;
  disabled?: boolean;
  /** Shown on results the app can't import, e.g. "over 10 min". */
  limitLabel?: string;
}) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const pasted = isUrl(input);

  function handleInput(value: string) {
    setInput(value);
    setError(null);
    // A pasted link is the selection; anything else clears it until a result
    // is picked, so the import button can't fire on a stale choice.
    onSelect(isUrl(value) ? value.trim() : "");
    // Results belong to the previous text; editing invalidates them either way.
    setResults(null);
    setPreview(null);
  }

  async function runSearch() {
    const query = input.trim();
    if (!query || pasted) return;
    setSearching(true);
    setError(null);
    setResults(null);
    setPreview(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }
      setResults(data.candidates ?? []);
    } catch {
      setError("Search failed. Is yt-dlp installed?");
    } finally {
      setSearching(false);
    }
  }

  return (
    // min-w-0: the dialog lays its children out in a grid, and without this a
    // long video title widens the whole panel past the dialog instead of
    // truncating.
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (pasted) onSubmit?.();
            else runSearch();
          }}
          disabled={disabled}
          autoFocus
          placeholder="Search YouTube, or paste a link…"
          className="flex-1 h-10 px-3 rounded-md border border-input bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={disabled || searching || !input.trim() || pasted}
          className="h-10 px-3 rounded-md border border-input text-sm font-medium hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {pasted && (
        <p className="text-[11px] text-muted-foreground">Using the pasted link.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {searching && (
        <p className="text-sm text-muted-foreground py-2">Searching YouTube…</p>
      )}
      {results?.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          Nothing usable found — try different words, or paste a link.
        </p>
      )}

      {preview && (
        <div className="rounded-lg overflow-hidden border border-border bg-black aspect-video">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${preview}`}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {results && results.length > 0 && (
        <div className="max-h-[320px] overflow-y-auto flex flex-col gap-1.5 pr-0.5">
          {results.map((c) => {
            const sel = selectedUrl === c.url;
            return (
              <div
                key={c.id}
                onClick={() => !c.tooLong && onSelect(sel ? "" : c.url)}
                className={`flex items-center gap-2.5 p-2 border rounded-lg transition-colors ${
                  c.tooLong
                    ? "border-border opacity-50 cursor-not-allowed"
                    : sel
                      ? "border-emerald-500 bg-emerald-500/10 cursor-pointer"
                      : "border-border hover:border-muted-foreground/40 cursor-pointer"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                    sel
                      ? "border-emerald-500 bg-emerald-500 ring-2 ring-inset ring-background"
                      : "border-muted-foreground/30"
                  }`}
                />
                <button
                  type="button"
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
                    {c.tooLong && limitLabel && (
                      <span className="font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700">
                        {limitLabel}
                      </span>
                    )}
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
        </div>
      )}
    </div>
  );
}
