/**
 * POST /api/sandbox/tempo
 *
 * R1 ultra-slow tempo render endpoint. Returns a URL to a server-rendered
 * tempo-stretched version of the stub song. Cached on disk in
 * apps/data/sandbox/.
 *
 * Mirrors the pitch route shape but uses the zod-at-edge pattern from
 * songs/[id]/route.ts (the pitch route's schema-less shortcut is an
 * anti-pattern per Kieran's review).
 *
 * Gated by middleware (SHREDDY_SANDBOX=1).
 *
 * Concurrency:
 *   - Server-side per-key render lock prevents two simultaneous POSTs
 *     for the same multiplier from both spawning ffmpeg (which would
 *     mid-write the same output file).
 *   - Client-side monotonic requestId pattern (in useStubPlayer) handles
 *     the second half — stale responses don't win.
 */

import { NextRequest, NextResponse } from "next/server";
import { stat, mkdir } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { z } from "zod";
import { stretchTempo, tempoFilename } from "@music-apps/shared";
import { STUBS_DIR, SANDBOX_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

const sandboxTempoRequestSchema = z.object({
  stubId: z.enum(["song-a"]),
  multiplier: z.number().min(0.1).max(1.0),
}).strict();

/** Per-render-key promise map — prevents concurrent ffmpeg for same output. */
const renderLocks = new Map<string, Promise<string>>();

async function getOrRender(
  key: string,
  factory: () => Promise<string>
): Promise<string> {
  const inFlight = renderLocks.get(key);
  if (inFlight) return inFlight;
  const p = factory().finally(() => renderLocks.delete(key));
  renderLocks.set(key, p);
  return p;
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = sandboxTempoRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { stubId, multiplier } = parsed.data;

  const sourceFile = path.join(STUBS_DIR, `${stubId}.mp3`);
  try {
    await stat(sourceFile);
  } catch {
    return NextResponse.json(
      { ok: false, error: `stub ${stubId} not found at ${sourceFile}` },
      { status: 404 }
    );
  }

  await mkdir(SANDBOX_DIR, { recursive: true });

  const outFilename = tempoFilename(stubId, multiplier);
  const key = `${stubId}:${multiplier}`;
  // Cache hit fast path (no lock needed for the metadata check)
  let cached = false;
  try {
    await stat(path.join(SANDBOX_DIR, outFilename));
    cached = true;
  } catch {
    // Not cached, will render
  }

  try {
    if (!cached) {
      await getOrRender(key, () =>
        stretchTempo(sourceFile, SANDBOX_DIR, stubId, multiplier)
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "render failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // Return URL the client can use as audio.src. We can't put the rendered
  // file under public/ (would be tracked-source pollution per architecture
  // review) so we serve it back through this route as a stream on GET.
  return NextResponse.json({
    ok: true,
    url: `/shreddy/api/sandbox/tempo?stubId=${stubId}&multiplier=${multiplier}`,
    cached,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const stubId = url.searchParams.get("stubId");
  const multiplierRaw = url.searchParams.get("multiplier");
  if (!stubId || !multiplierRaw) {
    return NextResponse.json(
      { ok: false, error: "missing stubId or multiplier" },
      { status: 400 }
    );
  }
  const multiplier = Number(multiplierRaw);
  const parsed = sandboxTempoRequestSchema.safeParse({ stubId, multiplier });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const outFile = path.join(
    SANDBOX_DIR,
    tempoFilename(parsed.data.stubId, parsed.data.multiplier)
  );
  try {
    const s = await stat(outFile);
    const stream = Readable.toWeb(createReadStream(outFile)) as ReadableStream;
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
      { ok: false, error: "not rendered yet" },
      { status: 404 }
    );
  }
}
