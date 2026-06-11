/**
 * POST /api/master/align
 *
 * Run gain alignment with a user-supplied baseline + per-snapshot targets.
 * Returns proposals (param + structural changes) and the measured offsets the
 * panel uses for prefill. Pure: does not write any file.
 *
 * Body:
 *   {
 *     baselineIndex: 0..7,
 *     targets:       { [snapIdx]: dBOffset },   // optional; missing snapshots fall back to tier defaults
 *     allowBoostInsertion?: boolean,            // default true for the new UI
 *     toleranceDb?: number,                      // default 0.5
 *   }
 */

import {
  alignGain,
  currentMeasuredOffsets,
  type AlignmentConfig,
} from "@music-apps/gain-estimator";

import { readActiveMaster } from "@/lib/masterStore";

export const dynamic = "force-dynamic";

type Body = {
  baselineIndex?: number;
  targets?: Record<string, number>;
  allowBoostInsertion?: boolean;
  toleranceDb?: number;
};

function clampSnapshotIndex(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(7, Math.round(v)));
}

function coerceTargets(raw: unknown): Record<number, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(k);
    const db = Number(v);
    if (Number.isFinite(idx) && idx >= 0 && idx <= 7 && Number.isFinite(db)) {
      out[Math.round(idx)] = db;
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const baselineIndex = clampSnapshotIndex(body.baselineIndex ?? 0);
    const targets = coerceTargets(body.targets);
    const allowBoostInsertion = body.allowBoostInsertion !== false; // default true
    const toleranceDb =
      typeof body.toleranceDb === "number" && body.toleranceDb > 0 ? body.toleranceDb : 0.5;

    const preset = readActiveMaster();
    const config: AlignmentConfig = {
      baselineIndex,
      soloLiftMode: "strict_3db", // not used when targets are explicit
      toleranceDb,
      targets,
      allowBoostInsertion,
    };
    const result = alignGain(preset, config);
    const measuredOffsets = currentMeasuredOffsets(preset, baselineIndex);

    return Response.json({
      ok: true,
      baselineIndex,
      baselineName: result.baselineName,
      measuredOffsets,
      insertion: result.insertion ?? null,
      proposals: [...result.proposals, ...result.unchanged]
        .sort((a, b) => a.snapshotIndex - b.snapshotIndex)
        .map((p) => ({
          snapshotIndex: p.snapshotIndex,
          snapshotName: p.snapshotName,
          currentDb: Number(p.currentDb.toFixed(2)),
          targetDb: Number(p.targetDb.toFixed(2)),
          deltaDb: Number(p.deltaDb.toFixed(2)),
          status: p.status,
          changes: p.changes,
          structuralChanges: p.structuralChanges ?? [],
          reasoning: p.reasoning,
          conflict: p.conflict ?? null,
        })),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
