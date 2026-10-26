import { readFileSync, writeFileSync } from "fs";
import { prisma } from "./prisma";
import { extractClip } from "./extract-clip";

// A section this short is a marker ("Phone", "Tab") or a stray model boundary
// rather than something you can practise, and cutting it still costs a full
// ffmpeg pass.
const MIN_SECTION_SEC = 2;

// Same tolerance the structure strip uses to call a block "active" — a lick
// within a second of a section's bounds is that section, already cut.
const MATCH_TOLERANCE_SEC = 1;

export interface AutoLickJob {
  status: "running" | "done" | "error";
  created: number;
  total: number;
  message?: string;
}

// On disk, not in a module-level Map: the run writes clip files into data/, the
// dev server treats that as a change and reloads this module, and an in-memory
// job would vanish mid-run while the ffmpeg loop it belonged to kept going. A
// file outlives the reload — same reason analyze-source keeps a pidfile.
const jobFile = (sourceId: string) => `/tmp/lickbank-autolicks-${sourceId}.json`;

interface StoredJob extends AutoLickJob {
  pid: number;
}

function writeJob(sourceId: string, job: AutoLickJob): void {
  try {
    writeFileSync(jobFile(sourceId), JSON.stringify({ ...job, pid: process.pid }));
  } catch {
    // Progress reporting is not worth failing the run over.
  }
}

export function getAutoLickJob(sourceId: string): AutoLickJob | null {
  let stored: StoredJob;
  try {
    stored = JSON.parse(readFileSync(jobFile(sourceId), "utf8"));
  } catch {
    return null;
  }

  const { pid, ...job } = stored;
  // A "running" job whose process is gone died with the server — say so rather
  // than leaving the client polling something that will never finish.
  if (job.status === "running") {
    try {
      process.kill(pid, 0); // throws if the process is gone
    } catch {
      return {
        status: "error",
        created: job.created,
        total: job.total,
        message: "The server restarted before all section licks were cut",
      };
    }
  }
  return job;
}

/**
 * Section titles repeat — a song has three "Chorus" blocks, and the model
 * leaves both "Bridge"s unnumbered — and licks sharing a name are unusable in
 * the library. Number only the titles that actually recur, so a one-off
 * "Intro" stays "Intro".
 */
function uniqueNames(names: string[]): string[] {
  const totals = new Map<string, number>();
  for (const n of names) totals.set(n, (totals.get(n) ?? 0) + 1);

  const seen = new Map<string, number>();
  return names.map((n) => {
    const nth = (seen.get(n) ?? 0) + 1;
    seen.set(n, nth);
    return totals.get(n)! > 1 ? `${n} ${nth}` : n;
  });
}

/**
 * Cut one lick per detected section, so an imported song arrives already broken
 * into its parts instead of as a single 5-minute blob.
 *
 * Takes whatever the strip holds: creator chapters when the video has them, the
 * local model's blocks when it doesn't. The model's labels are approximate —
 * but its boundaries are reliable, and a lick you rename beats a block you have
 * to re-select by hand.
 *
 * Skips sections that already have a lick, so re-analyzing doesn't duplicate.
 * Returns how many were created.
 */
export async function createLicksFromSections(sourceId: string): Promise<number> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: {
      sections: {
        where: { autoDetected: true },
        orderBy: { orderIndex: "asc" },
      },
      licks: true,
    },
  });

  if (!source || source.processingStatus !== "ready" || source.sections.length === 0) {
    return 0;
  }

  const names = uniqueNames(source.sections.map((s) => s.name.trim() || "Section"));
  const duration = source.durationSec ?? Infinity;

  const candidates = source.sections
    .map((section, i) => ({
      name: names[i],
      startSec: Math.max(0, section.startSec),
      endSec: Math.min(section.endSec, duration),
    }))
    .filter((c) => c.endSec - c.startSec >= MIN_SECTION_SEC)
    .filter(
      (c) =>
        !source.licks.some(
          (l) =>
            Math.abs(l.startSec - c.startSec) < MATCH_TOLERANCE_SEC &&
            Math.abs(l.endSec - c.endSec) < MATCH_TOLERANCE_SEC
        )
    );

  if (candidates.length === 0) {
    writeJob(sourceId, { status: "done", created: 0, total: 0 });
    return 0;
  }
  writeJob(sourceId, { status: "running", created: 0, total: candidates.length });

  let created = 0;
  // Sequential on purpose: each clip re-encodes video, and running a dozen
  // ffmpeg jobs at once just makes them all slower.
  for (const c of candidates) {
    const lick = await prisma.lick.create({
      data: {
        name: c.name,
        sourceId,
        startSec: c.startSec,
        endSec: c.endSec,
        durationSec: c.endSec - c.startSec,
      },
    });

    try {
      const { videoClipPath, audioClipPath } = await extractClip(
        lick.id,
        sourceId,
        c.startSec,
        c.endSec
      );
      await prisma.lick.update({
        where: { id: lick.id },
        data: { videoClipPath, audioClipPath },
      });
      created += 1;
    } catch (err) {
      // A lick with no clip files can't be practised, so don't leave one behind
      // — drop it and keep going with the rest of the sections.
      console.error(`Auto-lick "${c.name}" failed to extract:`, err);
      await prisma.lick.delete({ where: { id: lick.id } }).catch(() => {});
    }

    writeJob(sourceId, { status: "running", created, total: candidates.length });
  }

  writeJob(sourceId, { status: "done", created, total: candidates.length });
  return created;
}

/**
 * Fire-and-forget wrapper. Cutting a dozen clips takes minutes, so nothing
 * waits on it — the client polls the job for progress instead.
 */
export function startAutoLicks(sourceId: string): void {
  if (getAutoLickJob(sourceId)?.status === "running") return;

  writeJob(sourceId, { status: "running", created: 0, total: 0 });
  void createLicksFromSections(sourceId).catch((err) => {
    writeJob(sourceId, {
      status: "error",
      created: 0,
      total: 0,
      message: err instanceof Error ? err.message : "Failed to create licks from sections",
    });
  });
}
