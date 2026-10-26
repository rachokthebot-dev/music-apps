"use client";

import { useState } from "react";
import {
  Button,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@music-apps/ui";
import { CheckIcon, CircleNotchIcon, WarningIcon } from "@phosphor-icons/react";

interface Candidate {
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSec: number | null;
  tooLong?: boolean;
  score: number;
  reasons: string[];
}

interface MatchRow {
  title: string;
  artist: string;
  durationSec: number | null;
  candidates: Candidate[];
  confident: boolean;
  existingId: string | null;
}

type Stage = "url" | "matching" | "review";

// The pick for a song you already own: file it into the folder, download nothing.
const LIBRARY = "library";

function fmtDur(sec: number | null): string {
  if (sec === null) return "—";
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;
}

/**
 * How far off the album cut this video runs. The review table's job is to make
 * a bad auto-pick obvious at a glance, and length is the tell that reads
 * fastest — a live take or an extended mix shows up here before you have to
 * read the title.
 */
function driftLabel(candidate: Candidate, expected: number | null): string | null {
  if (!expected || candidate.durationSec === null) return null;
  const off = (candidate.durationSec - expected) / expected;
  if (Math.abs(off) < 0.1) return null;
  return `${off > 0 ? "+" : ""}${Math.round(off * 100)}% length`;
}

export function PlaylistImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [stage, setStage] = useState<Stage>("url");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [chosen, setChosen] = useState<Record<number, string | null>>({});
  const [importing, setImporting] = useState(false);

  function reset() {
    setStage("url");
    setUrl("");
    setError(null);
    setPlaylistName("");
    setRows([]);
    setChosen({});
  }

  async function handleParse() {
    if (!url.trim()) return;
    setError(null);
    setStage("matching");
    try {
      const parseRes = await fetch("/shreddy/api/playlist/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const parsed = await parseRes.json();
      if (!parseRes.ok) {
        setError(parsed.error || "Could not read that playlist");
        setStage("url");
        return;
      }

      const matchRes = await fetch("/shreddy/api/playlist/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: parsed.tracks }),
      });
      const matched = await matchRes.json();
      if (!matchRes.ok) {
        setError(matched.error || "Search failed");
        setStage("url");
        return;
      }

      const found: MatchRow[] = matched.rows ?? [];
      setPlaylistName(parsed.name);
      setRows(found);
      // Songs you own default to the library copy; otherwise auto-pick the
      // winner, but never something that can't be imported anyway.
      setChosen(
        Object.fromEntries(
          found.map((r, i) => {
            if (r.existingId) return [i, LIBRARY];
            const top = r.candidates[0];
            return [i, !top || top.tooLong ? null : top.url];
          })
        )
      );
      setStage("review");
    } catch {
      setError("Could not reach the playlist. Check the link and try again.");
      setStage("url");
    }
  }

  async function handleImport() {
    const picks = rows.flatMap((r, i): Array<{ title: string; artist: string; url?: string; existingId?: string }> => {
      const pick = chosen[i];
      if (!pick) return [];
      return pick === LIBRARY && r.existingId
        ? [{ title: r.title, artist: r.artist, existingId: r.existingId }]
        : [{ title: r.title, artist: r.artist, url: pick }];
    });
    if (picks.length === 0) return;

    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/shreddy/api/playlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playlistName, picks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }
      onOpenChange(false);
      reset();
      onImported();
    } catch {
      setError("Import failed");
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = Object.values(chosen).filter(Boolean).length;
  const ownedCount = Object.values(chosen).filter((c) => c === LIBRARY).length;
  const unsureCount = rows.filter((r, i) => chosen[i] && chosen[i] !== LIBRARY && !r.confident).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stage === "review" ? `Import “${playlistName}”` : "Import a playlist"}
          </DialogTitle>
        </DialogHeader>

        {stage === "url" && (
          <div className="space-y-4 pt-2">
            <div>
              <Input
                autoFocus
                placeholder="Apple Music or Spotify playlist link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleParse()}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                The playlist has to be shared publicly — use Share → Copy Link in Apple Music
                or Spotify. A private playlist can&apos;t be read.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={!url.trim()}>
                Find songs
              </Button>
            </div>
          </div>
        )}

        {stage === "matching" && (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <CircleNotchIcon className="size-6 animate-spin" />
            Reading the playlist and searching YouTube…
          </div>
        )}

        {stage === "review" && (
          <div className="space-y-3 pt-2 min-w-0">
            <p className="text-xs text-muted-foreground">
              {selectedCount} of {rows.length} go in the folder
              {ownedCount > 0 && ` · ${ownedCount} already in your library, no download`}
              {unsureCount > 0 && ` · ${unsureCount} worth a look`}
            </p>

            {rows.map((row, i) => {
              const picked = row.candidates.find((c) => c.url === chosen[i]) ?? null;
              const drift = picked ? driftLabel(picked, row.durationSec) : null;
              return (
                <div
                  key={`${row.title}-${i}`}
                  className="border border-border rounded-lg overflow-hidden bg-card"
                >
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
                    <span className="font-semibold text-sm truncate">{row.title}</span>
                    <span className="text-xs text-muted-foreground truncate">{row.artist}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {fmtDur(row.durationSec)}
                    </span>
                    <span className="flex-1" />
                    {row.existingId && (
                      <Badge variant="secondary" className="text-[10px]">
                        <CheckIcon className="size-3 mr-1" />
                        already have it
                      </Badge>
                    )}
                    {chosen[i] && chosen[i] !== LIBRARY && !row.confident && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <WarningIcon className="size-3" />
                        check this
                      </Badge>
                    )}
                  </div>

                  <div className="p-2.5 space-y-2">
                    {row.candidates.length === 0 && !row.existingId ? (
                      <p className="text-xs text-muted-foreground px-1 py-1.5">
                        Nothing on YouTube matched — import this one by hand later.
                      </p>
                    ) : (
                      <select
                        className="w-full text-xs bg-background border border-border rounded-md px-2 py-1.5"
                        value={chosen[i] ?? ""}
                        onChange={(e) =>
                          setChosen((c) => ({ ...c, [i]: e.target.value || null }))
                        }
                      >
                        {row.existingId && (
                          <option value={LIBRARY}>Use the song in your library</option>
                        )}
                        <option value="">Skip this song</option>
                        {row.candidates.map((c) => (
                          <option key={c.id} value={c.url} disabled={c.tooLong}>
                            {c.title} — {c.channel} ({fmtDur(c.durationSec)})
                            {c.tooLong ? " — too long to import" : ""}
                          </option>
                        ))}
                      </select>
                    )}

                    {picked && (
                      <p className="text-[11px] text-muted-foreground px-1">
                        {picked.reasons.join(" · ")}
                        {drift && (
                          <span className="text-amber-600 font-medium"> · {drift}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end sticky bottom-0 bg-background pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
                {importing ? (
                  <>
                    <CircleNotchIcon className="size-4 animate-spin mr-1.5" />
                    Queueing…
                  </>
                ) : (
                  `Import ${selectedCount} song${selectedCount === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
