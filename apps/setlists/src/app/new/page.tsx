"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Track {
  title: string;
  artist: string;
}

export default function NewSetlistPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"apple" | "paste">("apple");
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [name, setName] = useState("");
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importApple = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/setlists/api/import/apple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setTracks(data.tracks);
      setName(data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  /** "Song — Artist" per line; the dash is optional. */
  const parsePasted = () => {
    const parsed = pasted
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.split(/\s+[—–-]\s+/);
        return { title: (m[0] ?? line).trim(), artist: (m[1] ?? "").trim() };
      })
      .filter((t) => t.title);
    setTracks(parsed);
    if (!name) setName("New setlist");
  };

  const create = async () => {
    if (!tracks?.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/setlists/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceType: mode,
          sourceUrl: mode === "apple" ? url : null,
          songs: tracks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create setlist");
      router.push(`/s/${data.id}/videos`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create setlist");
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto p-5">
      <header className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Setlists
        </Link>
        <h1 className="text-lg font-semibold">New setlist</h1>
      </header>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex gap-1.5 mb-4">
          {(["apple", "paste"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setTracks(null);
              }}
              className={`px-3.5 py-2 rounded-lg text-[12.5px] font-semibold border transition-colors ${
                mode === m
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "apple" ? "Apple Music" : "Paste"}
            </button>
          ))}
        </div>

        {mode === "apple" ? (
          <>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://music.apple.com/us/playlist/…"
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm font-mono bg-background"
            />
            <button
              onClick={importApple}
              disabled={busy || !url.trim()}
              className="mt-3 bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5 disabled:opacity-50"
            >
              {busy ? "Reading…" : "Read playlist"}
            </button>
          </>
        ) : (
          <>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"Comfortably Numb — Pink Floyd\nParanoid — Black Sabbath"}
              className="w-full min-h-32 border border-border rounded-lg px-3 py-2.5 text-sm font-mono bg-background"
            />
            <button
              onClick={parsePasted}
              disabled={!pasted.trim()}
              className="mt-3 bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5 disabled:opacity-50"
            >
              Parse
            </button>
          </>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {tracks && (
          <div className="mt-5">
            <label className="block text-[13px] font-medium mb-1.5">Setlist name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background mb-4"
            />
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-[12.5px]">
                <tbody>
                  {tracks.map((t, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted-foreground w-8">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{t.title}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.artist}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">{tracks.length} songs</span>
              <button
                onClick={create}
                disabled={busy}
                className="bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Find videos →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
