/**
 * GET  /api/measure  — measured loudness per snapshot + residual vs. estimator.
 * POST /api/measure  — upload a WAV capture of one snapshot, store its LUFS.
 *
 * This closes the loop the static estimator can't on its own: it predicts
 * loudness from preset JSON but never hears the patch. The user records each
 * snapshot through the Helix (USB / line out, AGC off) and uploads the WAV;
 * we measure integrated LUFS (ITU-R BS.1770) and compare.
 *
 * Both estimated and measured loudness are reported *relative to snapshot 0*,
 * matching how /api/master/preview already presents the loudness landscape.
 * residual = measuredRel - estimatedRel  → how far the estimator is off.
 */

import { decodeWav, estimateAllSnapshots, integratedLufs } from "@music-apps/gain-estimator";

import { readActiveMaster } from "@/lib/masterStore";
import { readMeasurements, writeMeasurement } from "@/lib/measurementStore";

export const dynamic = "force-dynamic";

const BASELINE = 0;

function buildLandscape() {
  const preset = readActiveMaster();
  const est = estimateAllSnapshots(preset);
  const measured = readMeasurements();

  const estBase = est[BASELINE].loudnessDb;
  const measBase = measured[BASELINE]?.lufs;

  return est.map((s) => {
    const i = s.snapshotIndex;
    const m = measured[i];
    const estimatedRelDb = Number((s.loudnessDb - estBase).toFixed(2));
    const measuredRelDb =
      m && measBase !== undefined ? Number((m.lufs - measBase).toFixed(2)) : null;
    return {
      index: i,
      name: s.snapshotName,
      estimatedRelDb,
      measuredLufs: m ? Number(m.lufs.toFixed(2)) : null,
      measuredRelDb,
      // Positive → snapshot is louder in reality than the estimator predicts.
      residualDb: measuredRelDb === null ? null : Number((measuredRelDb - estimatedRelDb).toFixed(2)),
      measuredAt: m?.at ?? null,
    };
  });
}

export async function GET() {
  try {
    return Response.json({ ok: true, baseline: BASELINE, snapshots: buildLandscape() });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("wav");
    const idxRaw = form.get("snapshotIndex");

    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "Missing 'wav' file." }, { status: 400 });
    }
    const snapshotIndex = Number(idxRaw);
    if (!Number.isInteger(snapshotIndex) || snapshotIndex < 0 || snapshotIndex > 7) {
      return Response.json(
        { ok: false, error: "snapshotIndex must be an integer 0–7." },
        { status: 400 }
      );
    }

    const { sampleRate, channels } = decodeWav(Buffer.from(await file.arrayBuffer()));
    const { lufs, gatedBlocks } = integratedLufs(channels, sampleRate);

    if (!Number.isFinite(lufs)) {
      return Response.json(
        {
          ok: false,
          error:
            "Capture too short or too quiet to measure (need >0.4s above -70 LUFS). Record a few seconds of full chords with auto-gain disabled.",
        },
        { status: 422 }
      );
    }

    writeMeasurement(snapshotIndex, lufs);
    return Response.json({
      ok: true,
      snapshotIndex,
      lufs: Number(lufs.toFixed(2)),
      sampleRate,
      channels: channels.length,
      gatedBlocks,
      snapshots: buildLandscape(),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
