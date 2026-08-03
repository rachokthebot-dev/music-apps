import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const PRESET_DIR = path.resolve(process.cwd(), "../data/presets");

/**
 * Attach a .hlx you already have, instead of one from ToneCloud.
 *
 * Plenty of the best patches are your own or came from somewhere the index
 * doesn't cover — with no ToneCloud URL there was previously no way to get them
 * into a setlist at all.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const song = await prisma.setlistSong.findUnique({ where: { id } });
    if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach the preset as `file`" }, { status: 400 });
    }

    const raw = await file.text();
    let preset: { data?: { meta?: { name?: string }; tone?: unknown } };
    try {
      preset = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "That isn't a readable .hlx file" }, { status: 400 });
    }
    if (!preset?.data?.tone) {
      return NextResponse.json(
        { error: "That file has no tone data — expected a Helix .hlx preset" },
        { status: 400 }
      );
    }

    await mkdir(PRESET_DIR, { recursive: true });
    const filename = `${song.id}.hlx`;
    await writeFile(path.join(PRESET_DIR, filename), raw);

    const name = preset.data.meta?.name ?? file.name.replace(/\.hlx$/i, "");
    await prisma.$transaction([
      // Snapshots and levels live in SoundPath now; a new file invalidates any
      // reading taken against the old one, which its hash handles there.
      prisma.presetSnapshot.deleteMany({ where: { songId: song.id } }),
      prisma.setlistSong.update({
        where: { id: song.id },
        data: { presetChoice: "upload", presetPath: filename, presetName: name, presetUrl: null },
      }),
    ]);

    return NextResponse.json({ ok: true, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
