/**
 * GET /api/presets
 * Query params (all optional): sourceApp, flow, favorite ("true"/"false").
 *
 * Lists saved generations newest-first, without the heavy .hlx payload.
 */

import { listPresets } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const favoriteParam = searchParams.get("favorite");
    const presets = await listPresets({
      sourceApp: searchParams.get("sourceApp") ?? undefined,
      flow: searchParams.get("flow") ?? undefined,
      favorite:
        favoriteParam == null ? undefined : favoriteParam === "true",
    });
    return Response.json({ ok: true, presets });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
