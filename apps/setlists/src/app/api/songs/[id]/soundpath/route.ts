import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const SOUNDPATH = process.env.SOUNDPATH_URL ?? "http://127.0.0.1:3004/soundpath";
const SOUNDPATH_PUBLIC = process.env.SOUNDPATH_PUBLIC ?? "/soundpath";
const PRESET_DIR = path.resolve(process.cwd(), "../data/presets");

/**
 * Open a song's preset in SoundPath's leveller, so it can be recorded and
 * measured on its own.
 *
 * The levels step here only *estimates* loudness from the block chain;
 * SoundPath closes that loop by measuring real integrated LUFS from a capture
 * and writing the correction into the preset's output block.
 *
 * This used to push the patch into one of two comparison slots. Those are gone:
 * comparing two presets against each other stopped being the question once
 * every preset is levelled against one absolute target, so the patch now gets a
 * levelling session of its own. SoundPath keys those by the preset's contents,
 * so sending the same song twice returns to the same session with its readings
 * intact.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const song = await prisma.setlistSong.findUnique({ where: { id } });
    if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });
    if (!song.presetPath) {
      return NextResponse.json(
        { error: "No preset downloaded for this song yet" },
        { status: 400 }
      );
    }

    const hlx = await readFile(path.join(PRESET_DIR, song.presetPath), "utf8");

    // SoundPath validates the payload and rejects anything that isn't a preset,
    // so send it the same shape HX Edit would.
    const form = new FormData();
    form.append(
      "file",
      new File([hlx], `${(song.presetName ?? "preset").replace(/[^\w-]+/g, "_")}.hlx`, {
        type: "application/json",
      })
    );

    const res = await fetch(`${SOUNDPATH}/api/level`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.ok === false) {
      return NextResponse.json(
        { error: String(data?.error ?? `SoundPath returned ${res.status}`) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: data?.id,
      name: data?.name ?? song.presetName,
      url: `${SOUNDPATH_PUBLIC}/level?id=${encodeURIComponent(String(data?.id ?? ""))}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach SoundPath";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
