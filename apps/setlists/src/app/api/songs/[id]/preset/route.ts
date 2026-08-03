import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { downloadPreset, toneIdFromUrl } from "@/lib/tonecloud";
import { parseSnapshots } from "@/lib/preset-snapshots";

const PRESET_DIR = path.resolve(process.cwd(), "../data/presets");

/**
 * Download the chosen preset and record its snapshots, so the levels step has
 * something real to assign roles to.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const song = await prisma.setlistSong.findUnique({ where: { id } });
    if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });
    if (!song.presetUrl) {
      return NextResponse.json({ error: "This song has no preset URL" }, { status: 400 });
    }

    const toneId = toneIdFromUrl(song.presetUrl);
    if (!toneId) {
      return NextResponse.json(
        { error: "Could not read a tone id from that URL" },
        { status: 400 }
      );
    }

    const preset = await downloadPreset(toneId);
    const snapshots = parseSnapshots(preset);
    if (snapshots.length === 0) {
      return NextResponse.json(
        {
          error:
            "That preset has no snapshots, so it can't be levelled with the rest of the setlist. Pick another one.",
        },
        { status: 422 }
      );
    }

    await mkdir(PRESET_DIR, { recursive: true });
    const filename = `${song.id}.hlx`;
    await writeFile(path.join(PRESET_DIR, filename), JSON.stringify(preset));

    const meta = (preset as { data?: { meta?: { name?: string } } })?.data?.meta;

    await prisma.$transaction([
      prisma.presetSnapshot.deleteMany({ where: { songId: song.id } }),
      prisma.presetSnapshot.createMany({
        data: snapshots.map((s) => ({
          songId: song.id,
          index: s.index,
          name: s.name,
          role: s.role,
          roleSource: s.roleSource,
        })),
      }),
      prisma.setlistSong.update({
        where: { id: song.id },
        data: {
          presetPath: filename,
          presetName: meta?.name ?? song.presetName,
          // A successful download retracts whatever the last run said about
          // this preset. Without this the song stays red on Review with an
          // error that no longer describes anything on disk, and the only way
          // out is another full run.
          ...(song.importStatus === "error"
            ? { importStatus: "pending" as const, importError: null }
            : {}),
        },
      }),
    ]);

    return NextResponse.json({ ok: true, snapshots, name: meta?.name ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preset download failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
