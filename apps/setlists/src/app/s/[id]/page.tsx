import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpenSetlistInSoundPath } from "@/components/OpenSetlistInSoundPath";
import { SongOrderTable } from "@/components/SongOrderTable";

export const dynamic = "force-dynamic";

const LICKBANK = process.env.LICKBANK_PUBLIC ?? "/lickbank";
const SHREDDY = process.env.SHREDDY_PUBLIC ?? "/shreddy";
const SOUNDPATH_URL = process.env.SOUNDPATH_URL ?? "http://127.0.0.1:3004/soundpath";

interface SnapshotCounts {
  measured: number;
  total: number;
  songs: Record<string, { preset: string; measured: number; total: number }>;
}

/**
 * How many snapshots each song's preset really has, and how many are recorded.
 *
 * Asked of SoundPath rather than counted here. The two apps read a preset by
 * different rules, and the number on this page is a promise about how much
 * there is to record — so it has to come from the app that does the recording.
 *
 * Null when SoundPath hasn't been sent this gig, or isn't running. Showing
 * nothing is better than showing a number from the wrong place.
 */
async function snapshotsFromSoundPath(id: string): Promise<SnapshotCounts | null> {
  try {
    const res = await fetch(`${SOUNDPATH_URL}/api/setlist/snapshots?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.ok ? (d as SnapshotCounts) : null;
  } catch {
    return null;
  }
}

export default async function SavedSetlist({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sl = await prisma.setlist.findUnique({
    where: { id },
    include: {
      songs: {
        orderBy: { orderIndex: "asc" },
        include: { snapshots: { orderBy: { index: "asc" } } },
      },
    },
  });

  if (!sl) {
    return (
      <div className="p-5">
        <p className="text-sm text-destructive">Setlist not found</p>
        <Link href="/" className="text-sm text-muted-foreground">
          ← Setlists
        </Link>
      </div>
    );
  }

  const imported = sl.songs.filter((s) => s.lickbankSourceId || s.shreddySongId).length;
  const withPreset = sl.songs.filter((s) => s.presetChoice !== "none").length;
  const fromSoundPath = await snapshotsFromSoundPath(sl.id);

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto p-5">
      <div className="bg-card border border-border rounded-xl p-5 mb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold">{sl.name}</h1>
              {imported > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">
                  ready
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {sl.songs.length} songs · {sl.sourceType === "apple" ? "from Apple Music" : "pasted"} ·
              reference Clean {sl.referenceLufs.toFixed(1)} LUFS-eq
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="text-sm text-muted-foreground px-3 py-2">
              ← All setlists
            </Link>
            {/* The .hls download lived here. It handed out a Helix file from
                the app that doesn't hold the recordings, so what you got was
                only as levelled as SoundPath happened to be at that moment.
                Anything that ends up on the pedal now comes from SoundPath,
                where the measurements are. */}
            {sl.songs.some((s) => s.presetPath) && <OpenSetlistInSoundPath setlistId={sl.id} />}
            <Link
              href={`/s/${sl.id}/videos`}
              title="Walk the wizard again with every choice prefilled — change what you want and re-run"
              className="text-sm font-semibold px-4 py-2.5 rounded-lg border border-border"
            >
              Edit setlist
            </Link>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {[
            [`${imported}`, "imported"],
            [`${withPreset}/${sl.songs.length}`, "Helix patches"],
            fromSoundPath
              ? [`${fromSoundPath.measured}/${fromSoundPath.total}`, "snapshots recorded"]
              : ["—", "not in SoundPath yet"],
          ].map(([n, label]) => (
            <span key={label} className="text-[12.5px] px-3 py-1.5 border border-border rounded-lg">
              <b className="text-sm">{n}</b> {label}
            </span>
          ))}
        </div>
      </div>

      <SongOrderTable
        setlistId={sl.id}
        shreddyBase={SHREDDY}
        lickbankBase={LICKBANK}
        songs={sl.songs.map((s) => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          shreddySongId: s.shreddySongId,
          lickbankSourceId: s.lickbankSourceId,
          presetChoice: s.presetChoice,
          presetName: s.presetName,
          presetPath: s.presetPath,
          snapshots: fromSoundPath?.songs[s.id] ?? null,
        }))}
      />

    </div>
  );
}
