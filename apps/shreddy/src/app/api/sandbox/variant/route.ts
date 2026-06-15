/**
 * GET /api/sandbox/variant?stubId=song-a&kind=tone&name=clean
 *
 * Serves pre-rendered audio variants (R5 stems, R7 tone) from
 * apps/data/sandbox/. These files are generated once via
 * apps/scripts/prep-sandbox-variants.sh — not at runtime.
 *
 * Gated by middleware (SHREDDY_SANDBOX=1).
 */

import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { z } from "zod";
import { SANDBOX_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

const variantQuerySchema = z
  .object({
    stubId: z.enum(["song-a"]),
    kind: z.enum(["tone", "stems"]),
    name: z.string().min(1).max(32),
  })
  .strict();

const TONE_NAMES = new Set(["clean", "dirty", "dry", "wet"]);
const STEMS_NAMES = new Set(["all", "no_vocals", "vocals_only"]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = variantQuerySchema.safeParse({
    stubId: url.searchParams.get("stubId"),
    kind: url.searchParams.get("kind"),
    name: url.searchParams.get("name"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { stubId, kind, name } = parsed.data;
  const allowed = kind === "tone" ? TONE_NAMES : STEMS_NAMES;
  if (!allowed.has(name)) {
    return NextResponse.json(
      { ok: false, error: `unknown ${kind} variant: ${name}` },
      { status: 400 }
    );
  }
  const filename = `${stubId}_${kind === "tone" ? "tone" : "stems"}_${name}.mp3`;
  const filePath = path.join(SANDBOX_DIR, filename);
  try {
    const s = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(s.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: `variant ${filename} not generated yet. Run apps/scripts/prep-sandbox-variants.sh`,
      },
      { status: 404 }
    );
  }
}
