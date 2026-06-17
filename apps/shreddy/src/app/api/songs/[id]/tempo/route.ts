// POST /api/songs/[id]/tempo
//
// R1 Ultra-slow tempo render. iPad Safari clamps HTMLAudioElement.playbackRate
// at 0.5 — anything slower must be rendered server-side. This route stretches
// the source audio without changing pitch (rubberband when ffmpeg has it,
// chained atempo otherwise) and caches the result in AUDIO_DIR alongside the
// pitch variants.
//
// Mirrors the songs/[id]/pitch route's shape: POST returns { filename }, the
// client loads it via /api/media/<filename>. Validation uses zod at the edge
// (the pitch route's schema-less shortcut is an anti-pattern per the v1 plan).
//
// Concurrency: per-key in-process render lock prevents two simultaneous
// requests for the same { id, multiplier } from racing ffmpeg into the same
// output file.

import { NextRequest, NextResponse } from "next/server";
import { access, mkdir } from "fs/promises";
import path from "path";
import { z } from "zod";
import { AUDIO_DIR } from "@/lib/paths";
import { stretchTempo } from "@music-apps/shared";

export const dynamic = "force-dynamic";

const tempoRequestSchema = z
  .object({
    multiplier: z.number().min(0.1).max(1.0),
  })
  .strict();

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const raw = await request.json().catch(() => null);
  const parsed = tempoRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { multiplier } = parsed.data;

  const sourceFile = path.join(AUDIO_DIR, `${id}.mp3`);
  try {
    await access(sourceFile);
  } catch {
    return NextResponse.json(
      { error: "Source audio not found" },
      { status: 404 }
    );
  }

  await mkdir(AUDIO_DIR, { recursive: true });

  try {
    const filename = await getOrRender(`${id}:${multiplier}`, () =>
      stretchTempo(sourceFile, AUDIO_DIR, id, multiplier)
    );
    return NextResponse.json({ filename });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Tempo processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
