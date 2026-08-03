import { execFile } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { fetchChapters } from "@music-apps/shared";
import { SOURCES_DIR } from "./paths";
import { prisma } from "./prisma";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");
// Shared with Shreddy: SongFormer runs in its own Python 3.11 venv.
const PYTHON_BIN = path.join(PROJECT_ROOT, ".venv-sf", "bin", "python3");
const ANALYZE_SCRIPT = path.join(PROJECT_ROOT, "scripts", "analyze.py");

// Measured on an M4 mini: 2:47 → 55 s, 6:17 → ~130 s. Roughly linear until the
// tensors stop fitting, after which it collapses — a 10:38 source ran past
// 10 min with nothing resident competing for RAM.
const TIMEOUT_MS = 600000;

export interface DetectedSection {
  name: string;
  startSec: number;
  endSec: number;
}

/**
 * Local structure detection. Boundaries are reliable; labels are not — on
 * instrumental sources SongFormer has no vocal cue to separate sung sections
 * from solos, so it tends to call every non-riff block "Solo N". Treat the
 * output as candidate blocks to pick from, not as ground truth.
 */
// The dev server reloads this module on every save, which throws away the job
// map — but not the child process it spawned. A pidfile outlives the reload, so
// "is something running?" stays answerable.
const PIDFILE = "/tmp/lickbank-analyze.pid";

/** The live model run, if any, as recorded on disk. Null if the pid is dead. */
export function readRunningPid(): { pid: number; sourceId: string } | null {
  try {
    const [pid, sourceId] = readFileSync(PIDFILE, "utf8").trim().split(" ");
    process.kill(Number(pid), 0); // throws if the process is gone
    return { pid: Number(pid), sourceId };
  } catch {
    return null;
  }
}

function runSongFormer(audioPath: string, sourceId: string): Promise<DetectedSection[]> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_BIN,
      [ANALYZE_SCRIPT, audioPath],
      {
        timeout: TIMEOUT_MS,
        // SIGTERM is ignored by a process wedged in uninterruptible sleep — which
        // is exactly what happens when the model can't get resident memory and
        // thrashes. Without SIGKILL the run outlives the timeout and keeps
        // competing for RAM long after we've stopped waiting for it.
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        try {
          unlinkSync(PIDFILE);
        } catch {
          // Already gone (server restarted, or another run cleaned up).
        }
        if (error) {
          console.error("SongFormer analysis failed:", stderr || error.message);

          // `killed` is set only when Node's own timeout fires; an external
          // kill (the OS reclaiming memory) shows up as a bare signal. They
          // have different causes, so don't give them the same message.
          const { killed, signal } = error as { killed?: boolean; signal?: string | null };
          if (killed) {
            reject(
              new Error(
                `The local model ran past ${TIMEOUT_MS / 60000} minutes and was stopped. Inference cost climbs with length — sources beyond ~8 minutes often don't finish. Chapters are the practical option for long videos.`
              )
            );
            return;
          }
          if (signal) {
            reject(
              new Error(
                "The local model was killed before it finished — usually the machine is out of memory. Free up RAM (a resident local LLM is the usual culprit) and try again."
              )
            );
            return;
          }

          // analyze.py catches its own exceptions and prints {"error": ...},
          // which is far more useful than stderr — that leads with harmless
          // transformers warnings.
          let detail = "";
          try {
            detail = JSON.parse(stdout.trim())?.error ?? "";
          } catch {
            // Not JSON — fall back to the tail of stderr, where a Python
            // traceback puts the actual exception.
            detail = stderr.trim().split("\n").slice(-2).join(" ");
          }
          reject(
            new Error(
              `The local model failed: ${(detail || error.message).slice(0, 200)}`
            )
          );
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          resolve(Array.isArray(result?.sections) ? result.sections : []);
        } catch {
          console.error("Failed to parse analysis output:", stdout);
          reject(new Error("Could not parse the local model's output."));
        }
      }
    );

    if (child.pid) writeFileSync(PIDFILE, `${child.pid} ${sourceId}`);
  });
}

/**
 * "auto" prefers chapters and falls back to the model — the right default for
 * a fresh import. The explicit modes exist because the two sources have very
 * different costs, so the choice belongs to whoever is waiting on it.
 */
export type AnalyzeMode = "auto" | "chapters" | "model";

/**
 * Detect the structure of a whole source video so the solo can be found before
 * clipping. Creator chapters win when present — they're exact and free; the
 * local model is the fallback for the ~2/3 of videos without them.
 *
 * Replaces only auto-detected sections; hand-made ones are left alone.
 * Returns how many sections were written — 0 means nothing was detected and
 * the existing strip is untouched.
 */
export async function analyzeSource(
  sourceId: string,
  mode: AnalyzeMode = "auto"
): Promise<number> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return 0;

  let sections: DetectedSection[] = [];
  let detectedBy = "chapters";

  if (mode !== "model") {
    const chapters = await fetchChapters(source.youtubeUrl);
    sections = chapters.map((c) => ({
      name: c.title,
      startSec: c.startSec,
      endSec: c.endSec,
    }));
  }

  // "chapters" stops here on purpose: someone who asked for a metadata refresh
  // shouldn't silently get minutes of CPU instead.
  if (sections.length === 0 && mode !== "chapters" && source.audioPath) {
    detectedBy = "songformer";
    try {
      sections = await runSongFormer(path.join(SOURCES_DIR, source.audioPath), sourceId);
    } catch (err) {
      // On an explicit request the caller is waiting on an answer, so surface
      // the failure. On import ("auto") it's a nice-to-have running in the
      // background — don't fail the import over it.
      if (mode === "model") throw err;
      console.error("Background analysis failed:", err);
      return 0;
    }
  }

  // Nothing detected (no chapters, no audio, or the model errored) — leave any
  // existing sections in place rather than wiping them for an empty result.
  if (sections.length === 0) return 0;

  await prisma.$transaction([
    prisma.sourceSection.deleteMany({ where: { sourceId, autoDetected: true } }),
    prisma.sourceSection.createMany({
      data: sections.map((s, i) => ({
        sourceId,
        name: s.name,
        startSec: s.startSec,
        endSec: s.endSec,
        orderIndex: i,
        autoDetected: true,
        detectedBy,
      })),
    }),
  ]);

  return sections.length;
}

export interface AnalyzeJob {
  status: "running" | "done" | "error";
  mode: AnalyzeMode;
  count?: number;
  message?: string;
}

// Per-source, in-memory. Survives requests but not a server restart, which is
// fine: a restart kills the child process too, so there's no job to track.
const jobs = new Map<string, AnalyzeJob>();

export function getAnalyzeJob(sourceId: string): AnalyzeJob | null {
  return jobs.get(sourceId) ?? null;
}

/**
 * Any model run in flight, on any source. The machine fits one — two concurrent
 * runs starve each other into the timeout, which reads as "the model is broken"
 * rather than "two of them were fighting". Chapters runs spawn nothing, so they
 * are not counted here.
 */
export function getRunningModelRun(): { sourceId: string; job: AnalyzeJob } | null {
  for (const [sourceId, job] of jobs) {
    if (job.status === "running" && job.mode !== "chapters") return { sourceId, job };
  }
  // The map is empty after a reload but the child may still be alive — trust
  // the pidfile over our own memory.
  const live = readRunningPid();
  if (live) return { sourceId: live.sourceId, job: { status: "running", mode: "model" } };
  return null;
}

/**
 * Fire-and-forget wrapper that records the outcome so the client can poll a
 * real status instead of inferring one from whether rows changed.
 *
 * The guard matters: each model run loads a 3 GB model, so two clicks on one
 * source put two of them on the machine at once and neither finishes.
 */
export function startAnalysis(sourceId: string, mode: AnalyzeMode): AnalyzeJob {
  const existing = jobs.get(sourceId);
  if (existing?.status === "running") return existing;

  // Global, not per-source: a second run on a *different* source is just as
  // fatal, since both load the model and neither then fits in memory.
  const inFlight = getRunningModelRun();
  if (inFlight && mode !== "chapters") return inFlight.job;

  const job: AnalyzeJob = { status: "running", mode };
  jobs.set(sourceId, job);

  void analyzeSource(sourceId, mode)
    .then((count) => jobs.set(sourceId, { status: "done", mode, count }))
    .catch((err) =>
      jobs.set(sourceId, {
        status: "error",
        mode,
        message: err instanceof Error ? err.message : "Analysis failed",
      })
    );

  return job;
}
