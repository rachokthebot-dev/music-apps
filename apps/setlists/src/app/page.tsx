import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteSetlist } from "@/components/DeleteSetlist";
import { SidebarMenuButton } from "@music-apps/shared/app-shell";
import { Shell } from "@/components/Shell";
import { MagnifyingGlassIcon, MicrophoneStageIcon, PlusIcon } from "@phosphor-icons/react/ssr";

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
    <Shell>
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 lg:px-8 py-4 lg:py-6 space-y-5">
      <header className="flex items-center gap-1 lg:hidden">
        <SidebarMenuButton />
        <h1 className="text-xl font-semibold tracking-tight">Setlists</h1>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            className="w-full h-12 pl-12 pr-4 rounded-full bg-card border border-border text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search setlists, or paste an Apple Music link…"
          />
        </div>
        <Link
          href="/new"
          className="h-12 shrink-0 px-5 rounded-full bg-primary text-primary-foreground flex items-center gap-2 text-sm font-semibold active:scale-95 transition-all duration-200 ease-spring"
        >
          <PlusIcon className="size-5" weight="bold" />
          <span className="hidden sm:inline">New setlist</span>
          <span className="sm:hidden">New</span>
        </Link>
      </div>

      <div className="flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Saved setlists</h2>
        <span className="text-sm text-muted-foreground">
          {setlists.length} {setlists.length === 1 ? "setlist" : "setlists"}
        </span>
      </div>

      {setlists.length === 0 ? (
        <div className="border border-border border-dashed rounded-3xl py-12 text-center">
          <p className="text-base font-medium text-muted-foreground">No setlists yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Paste an Apple Music playlist link to build your first one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {setlists.map((s) => {
            const withPreset = s.songs.filter((x) => x.presetChoice !== "none").length;
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 p-4 rounded-3xl bg-card border border-border active:scale-[0.99] transition-transform duration-300 ease-spring"
              >
                <Link href={`/s/${s.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="size-14 rounded-2xl bg-emerald-500/15 text-emerald-500 grid place-items-center shrink-0">
                    <MicrophoneStageIcon className="size-7" weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-semibold tracking-tight truncate">{s.name}</div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">
                      {s.songs.length} songs · {s.sourceType === "apple" ? "from Apple Music" : "pasted"} ·{" "}
                      {fmtDate(s.createdAt)}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground shrink-0">
                    Helix {withPreset}/{s.songs.length}
                  </span>
                </Link>
                <DeleteSetlist id={s.id} name={s.name} />
              </div>
            );
          })}
        </div>
      )}
    </div>
    </Shell>
  );
}
