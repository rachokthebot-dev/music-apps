/**
 * POST /api/design-preset
 * body: { tones: [t1, t2, t3] }
 *
 * Gemini designs a complete preset, applier builds the HelixPreset, response
 * returns:
 *   - the parsed design (so the UI can render the preview without re-parsing)
 *   - the applied .hlx as a string (so the UI can preview or download)
 *
 * The caller decides what to do with it: stage it, save it as the active
 * master, download it, etc.
 */

import {
  applyPresetDesign,
  stringifyHelixPreset,
  estimateAllSnapshots,
} from "@music-apps/gain-estimator";

import { designPreset, validateDesign } from "@/lib/designPreset";
import { designPresetTwoAgents } from "@/lib/designPresetAgents";
import type { LlmProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

type DesignMode = "single" | "two-agent";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tones?: string[];
      provider?: LlmProvider;
      mode?: DesignMode;
      ollamaModel?: string;
    };
    const tones = body.tones ?? [];
    if (tones.length !== 3 || tones.some((t) => !t || !t.trim())) {
      return Response.json(
        { ok: false, error: "tones must be an array of 3 non-empty strings" },
        { status: 400 }
      );
    }
    // Default to two-agent (cleaner output, fewer hallucinations); caller can
    // opt back to single-call for ~2× speed.
    const mode: DesignMode = body.mode === "single" ? "single" : "two-agent";

    let design;
    let validation;
    let rig = null;
    let durations: Record<string, number> | undefined;

    if (mode === "two-agent") {
      const result = await designPresetTwoAgents(
        [tones[0].trim(), tones[1].trim(), tones[2].trim()] as [string, string, string],
        body.provider
      );
      design = result.design;
      validation = result.validation;
      rig = result.rig;
      durations = result.durations;
    } else {
      design = await designPreset({
        tones: [tones[0].trim(), tones[1].trim(), tones[2].trim()] as [string, string, string],
        provider: body.provider,
        ollamaModel: body.ollamaModel,
      });
      validation = validateDesign(design);
    }

    const { preset, report } = applyPresetDesign(design);
    // Merge applier warnings + design validation warnings
    report.warnings.push(...validation.warnings);

    const loudness = estimateAllSnapshots(preset).map((s, i) => ({
      index: i,
      name: s.snapshotName,
      loudnessDb: Number((s.loudnessDb - estimateAllSnapshots(preset)[0].loudnessDb).toFixed(2)),
    }));

    return Response.json({
      ok: true,
      mode,
      rig,            // null for single-agent mode
      design,
      applyReport: report,
      validation: {
        warnings: validation.warnings,
        dspPerPath: validation.dspPerPath,
      },
      loudness,
      durations,      // present for two-agent mode
      hlx: stringifyHelixPreset(preset),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
