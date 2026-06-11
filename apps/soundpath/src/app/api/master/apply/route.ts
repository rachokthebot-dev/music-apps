/**
 * POST /api/master/apply
 *
 * Run alignment, apply the proposals to the active master, write the patched
 * preset to iCloud, and return it as a downloadable file.
 *
 * Body (all fields optional — empty body = legacy DEFAULT_CONFIG behavior):
 *   {
 *     baselineIndex?:        0..7,                       // which snapshot is the 0 dB anchor
 *     targets?:              { [snapIdx]: dBOffset },    // user-set per-snapshot targets
 *     allowBoostInsertion?:  boolean,                    // default true when targets provided
 *     toleranceDb?:          number,                     // default 0.5
 *   }
 *
 * Idempotent given the same master + body.
 */

import {
  alignGain,
  applyProposals,
  DEFAULT_CONFIG,
  stringifyHelixPreset,
  type AlignmentConfig,
} from "@music-apps/gain-estimator";

import { readActiveMaster, writeAlignedOutput } from "@/lib/masterStore";

export const dynamic = "force-dynamic";

type ApplyBody = {
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

/**
 * Build an RFC 5987-compliant Content-Disposition value so non-ASCII filenames
 * (em-dashes, etc.) survive HTTP header transit. Both filename= (ASCII-safe
 * fallback) and filename*= (UTF-8 encoded) so old + modern clients agree.
 */
function disposition(fileName: string): string {
  const ascii = fileName.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function POST(req: Request) {
  try {
    // Body is optional — empty body keeps the legacy DEFAULT_CONFIG behavior.
    const raw = (await req.json().catch(() => null)) as ApplyBody | null;
    const config: AlignmentConfig =
      raw && (raw.targets || raw.baselineIndex !== undefined)
        ? {
            baselineIndex: clampSnapshotIndex(raw.baselineIndex ?? 0),
            soloLiftMode: "strict_3db",
            toleranceDb:
              typeof raw.toleranceDb === "number" && raw.toleranceDb > 0
                ? raw.toleranceDb
                : 0.5,
            targets: coerceTargets(raw.targets),
            allowBoostInsertion: raw.allowBoostInsertion !== false,
          }
        : DEFAULT_CONFIG;

    const preset = readActiveMaster();
    const alignment = alignGain(preset, config);
    const patched = applyProposals(preset, alignment.proposals, {
      insertion: alignment.insertion,
    });
    writeAlignedOutput(patched);

    const body = stringifyHelixPreset(patched);
    const fileName = `${preset.data.meta.name || "preset"} — aligned.hlx`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": disposition(fileName),
        "X-Proposals-Applied": String(alignment.proposals.length),
        "X-Insertion": alignment.insertion ? "true" : "false",
        "X-Output-Saved": "true",
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
