import Link from "next/link";

const STEPS = [
  { slug: "videos", label: "LickBank videos" },
  { slug: "track-videos", label: "Shreddy videos" },
  { slug: "presets", label: "Helix presets" },
  { slug: "review", label: "Review" },
] as const;

export function WizardRail({ setlistId, current }: { setlistId: string; current: string }) {
  const idx = STEPS.findIndex((s) => s.slug === current);
  return (
    <div className="flex items-center gap-1.5 mb-5 flex-wrap">
      {STEPS.map((s, i) => {
        const state = i === idx ? "active" : i < idx ? "done" : "todo";
        return (
          <span key={s.slug} className="flex items-center gap-1.5">
            <Link
              href={`/s/${setlistId}/${s.slug}`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${
                state === "active"
                  ? "bg-foreground text-background border-foreground"
                  : state === "done"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    : "bg-card text-muted-foreground border-border"
              }`}
            >
              <span
                className={`w-[18px] h-[18px] rounded-full grid place-items-center text-[10px] ${
                  state === "active"
                    ? "bg-background/20"
                    : state === "done"
                      ? "bg-emerald-500 text-white"
                      : "bg-muted"
                }`}
              >
                {i + 1}
              </span>
              {s.label}
            </Link>
            {i < STEPS.length - 1 && <span className="text-muted-foreground/40 text-[11px]">›</span>}
          </span>
        );
      })}
    </div>
  );
}
