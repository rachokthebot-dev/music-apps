import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteSetlist } from "@/components/DeleteSetlist";
import { AppSwitcher } from "@music-apps/shared/app-switcher";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function HomePage() {
  const setlists = await prisma.setlist.findMany({
    orderBy: { createdAt: "desc" },
    include: { songs: { select: { id: true, presetChoice: true } } },
  });

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto p-5">
      <header className="flex items-center gap-3 mb-5">
        <h1 className="text-lg font-semibold">Setlists</h1>
        <span className="flex-1" />
        <AppSwitcher currentAppId="setlists" />
      </header>

      <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3.5 mb-5">
        <span className="text-base">🔍</span>
        <input
          className="flex-1 bg-transparent outline-none text-[15px]"
          placeholder="Search setlists, or paste an Apple Music link…"
        />
        <Link
          href="/new"
          className="bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5"
        >
          New setlist
        </Link>
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <span className="font-bold text-[13px]">Saved setlists</span>
        <span className="text-xs text-muted-foreground">{setlists.length}</span>
      </div>

      {setlists.length === 0 ? (
        <div className="border border-border border-dashed rounded-xl py-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">No setlists yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Paste an Apple Music playlist link to build your first one.
          </p>
        </div>
      ) : (
        setlists.map((s) => {
          const withPreset = s.songs.filter((x) => x.presetChoice !== "none").length;
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3.5 mb-2.5 hover:border-muted-foreground/40 transition-colors"
            >
              <Link href={`/s/${s.id}`} className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-[10px] bg-violet-500/10 grid place-items-center text-xl shrink-0">
                  🎤
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14.5px] truncate">{s.name}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">
                    {s.songs.length} songs · {s.sourceType === "apple" ? "from Apple Music" : "pasted"} ·{" "}
                    {fmtDate(s.createdAt)}
                  </div>
                </div>
                <span className="text-[10.5px] font-bold px-2 py-1 rounded-md bg-violet-500/10 text-violet-600 shrink-0">
                  Helix {withPreset}/{s.songs.length}
                </span>
              </Link>
              <DeleteSetlist id={s.id} name={s.name} />
            </div>
          );
        })
      )}
    </div>
  );
}
