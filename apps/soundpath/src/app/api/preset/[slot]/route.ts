/**
 * GET  /api/preset/[slot]  — read the slot's preset + run estimator +
 *                            ship chain + per-snapshot state for the grid view
 * POST /api/preset/[slot]  — load a preset into the slot, either from a
 *                            multipart .hlx upload or JSON { presetId } that
 *                            pulls the hlx payload from the presets library
 * DELETE /api/preset/[slot] — clear the slot (removes the slot file and its
 *                            measurements; the pane returns to its empty state)
 */

import {
  estimateAllSnapshots,
  friendlyBlock,
  realWorldName,
  friendlyCategory,
  type HelixPreset,
  type BlockNode,
} from "@music-apps/gain-estimator";

import { isSlot, slotExists, readSlot, writeSlot, deleteSlot, slotPath } from "@/lib/masterStore";
import { clearMeasurements } from "@/lib/measurementStore";
import { getPreset } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

/** Per-block info shipped to the client for grid rendering. */
type ChainBlock = {
  dsp: string;
  slot: string;
  model: string;
  friendly: string;            // "Amp (JCM800)"
  category: string | null;     // "Amp"
  basedOn: string | undefined; // "Marshall JTM-45"
  /** Raw @path / @position from the preset, for topology rendering. */
  path: number;
  position: number;
  /** Default param values from the preset's block definition (numeric only). */
  defaults: { [param: string]: number };
};

/** Per-snapshot state derived from the preset. */
type SnapshotState = {
  index: number;
  name: string;
  blocks: { [slotPath: string]: boolean };       // "dsp0/block7" → true
  params: { [slotPath: string]: { [param: string]: number } };
};

function numericDefaults(block: BlockNode): { [param: string]: number } {
  const out: { [k: string]: number } = {};
  for (const [k, v] of Object.entries(block)) {
    if (k.startsWith("@")) continue;
    if (typeof v === "number") {
      out[k] = v;
    } else if (v && typeof v === "object" && "@value" in v) {
      const inner = (v as { "@value": unknown })["@value"];
      if (typeof inner === "number") out[k] = inner;
    }
  }
  return out;
}

function buildChain(preset: HelixPreset): ChainBlock[] {
  const out: ChainBlock[] = [];
  for (const dsp of ["dsp0", "dsp1"] as const) {
    const map = preset.data.tone[dsp];
    if (!map) continue;
    for (const [slot, node] of Object.entries(map)) {
      if (!slot.startsWith("block")) continue;
      if (!node || typeof node !== "object") continue;
      const block = node as BlockNode;
      const model = block["@model"];
      if (typeof model !== "string") continue;
      const pathVal = block["@path"];
      const posVal = block["@position"];
      out.push({
        dsp,
        slot,
        model,
        friendly: friendlyBlock(model),
        category: friendlyCategory(model),
        basedOn: realWorldName(model),
        path: typeof pathVal === "number" ? pathVal : 0,
        position: typeof posVal === "number" ? posVal : 0,
        defaults: numericDefaults(block),
      });
    }
  }
  return out;
}

function buildSnapshots(preset: HelixPreset): SnapshotState[] {
  const out: SnapshotState[] = [];
  for (let i = 0; i < 8; i++) {
    const snap = preset.data.tone[`snapshot${i}` as keyof typeof preset.data.tone] as
      | {
          "@name"?: string;
          blocks?: { [dsp: string]: { [slot: string]: boolean } };
          controllers?: {
            [dsp: string]: {
              [slot: string]: { [param: string]: { "@value": number; "@fs_enabled"?: boolean } };
            };
          };
        }
      | undefined;

    const enables: SnapshotState["blocks"] = {};
    const params: SnapshotState["params"] = {};

    if (snap?.blocks) {
      for (const [dsp, slotMap] of Object.entries(snap.blocks)) {
        for (const [slot, enabled] of Object.entries(slotMap)) {
          enables[`${dsp}/${slot}`] = enabled;
        }
      }
    }
    if (snap?.controllers) {
      for (const [dsp, slotMap] of Object.entries(snap.controllers)) {
        for (const [slot, paramMap] of Object.entries(slotMap)) {
          const path = `${dsp}/${slot}`;
          params[path] ??= {};
          for (const [pname, pdata] of Object.entries(paramMap)) {
            if (typeof pdata?.["@value"] === "number") {
              params[path][pname] = pdata["@value"];
            }
          }
        }
      }
    }

    out.push({
      index: i,
      name: snap?.["@name"] ?? `snapshot${i}`,
      blocks: enables,
      params,
    });
  }
  return out;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slot: string }> }
) {
  const { slot } = await params;
  if (!isSlot(slot)) {
    return Response.json({ ok: false, error: "slot must be 'a' or 'b'" }, { status: 400 });
  }
  try {
    if (!slotExists(slot)) {
      return Response.json({ ok: false, empty: true });
    }
    const preset = readSlot(slot);
    const all = estimateAllSnapshots(preset);
    const baselineRaw = all[0].loudnessDb;

    // loudnessDb is normalized to snapshot 0 for the landscape cards;
    // rawLoudnessDb is the unnormalized estimate — the cross-preset delta is
    // computed from rawLoudnessDb + outputGain (the estimator does not see
    // the Output Block).
    const loudness = all.map((s) => ({
      index: s.snapshotIndex,
      name: s.snapshotName,
      loudnessDb: Number((s.loudnessDb - baselineRaw).toFixed(2)),
      rawLoudnessDb: Number(s.loudnessDb.toFixed(2)),
    }));

    // The Output Block's gain — this is the absolute baseline knob for the
    // whole preset. We read dsp0.outputA.gain (active output) as the
    // representative value; export writes it back to all 4 output slots
    // (dsp0/dsp1 × outputA/outputB) to keep the routing balanced.
    const outA = preset.data.tone.dsp0?.["outputA"] as { gain?: number } | undefined;
    const outputGain = typeof outA?.gain === "number" ? outA.gain : 0;

    return Response.json({
      ok: true,
      name: preset.data.meta.name,
      outputGain,
      chain: buildChain(preset),
      snapshots: buildSnapshots(preset),
      loudness,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        slotPath: slotPath(slot),
      },
      { status: 500 }
    );
  }
}

function validatePresetJson(text: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "file is not valid JSON" };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("data" in parsed) ||
    typeof (parsed as { data: unknown }).data !== "object"
  ) {
    return { ok: false, error: "file does not look like a Helix preset" };
  }
  return { ok: true };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slot: string }> }
) {
  const { slot } = await params;
  if (!isSlot(slot)) {
    return Response.json({ ok: false, error: "slot must be 'a' or 'b'" }, { status: 400 });
  }
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // JSON { presetId } — pull the hlx payload from the presets library.
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { presetId?: string };
      if (!body.presetId) {
        return Response.json({ ok: false, error: "expected presetId" }, { status: 400 });
      }
      const row = await getPreset(body.presetId);
      if (!row) {
        return Response.json({ ok: false, error: "preset not found" }, { status: 404 });
      }
      const check = validatePresetJson(row.hlx);
      if (!check.ok) {
        return Response.json({ ok: false, error: check.error }, { status: 400 });
      }
      writeSlot(slot, row.hlx);
      clearMeasurements(slot); // measurements belong to the previous preset
      return Response.json({ ok: true, name: row.name, size: row.hlx.length });
    }

    // Multipart .hlx upload.
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "expected multipart field 'file'" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".hlx")) {
      return Response.json({ ok: false, error: "must be a .hlx file" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const check = validatePresetJson(buf.toString("utf-8"));
    if (!check.ok) {
      return Response.json({ ok: false, error: check.error }, { status: 400 });
    }

    writeSlot(slot, buf);
    clearMeasurements(slot); // measurements belong to the previous preset
    return Response.json({ ok: true, name: file.name, size: buf.byteLength });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slot: string }> }
) {
  const { slot } = await params;
  if (!isSlot(slot)) {
    return Response.json({ ok: false, error: "slot must be 'a' or 'b'" }, { status: 400 });
  }
  try {
    deleteSlot(slot);
    clearMeasurements(slot);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
