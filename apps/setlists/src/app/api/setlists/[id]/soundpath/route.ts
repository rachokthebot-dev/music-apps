import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const SOUNDPATH = process.env.SOUNDPATH_URL ?? "http://127.0.0.1:3004/soundpath";
const SOUNDPATH_PUBLIC = process.env.SOUNDPATH_PUBLIC ?? "/soundpath";
const PRESET_DIR = path.resolve(process.cwd(), "../data/presets");

/**
 * Hand the whole gig to SoundPath in one go.
 *
 * Posts the presets as JSON rather than building an .hls — SoundPath only needs
 * the preset payloads, and skipping the compress/encode round-trip means one
 * less place for the two apps to disagree about the container format.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const setlist = await prisma.setlist.findUnique({
      where: { id },
      include: {
        songs: {
          orderBy: { orderIndex: "asc" },
          include: { snapshots: { orderBy: { index: "asc" } } },
        },
      },
    });
    if (!setlist) return NextResponse.json({ error: "Setlist not found" }, { status: 404 });

    const presets: Array<{ name: string; hlx: string; songId: string }> = [];
    // Songs that can't be handed over. Skipping them quietly is how a gig
    // arrives in SoundPath missing two songs while every row still reads
    // "done" here — and levels are averaged across whatever did arrive, so the
    // result looks complete and is wrong.
    const skipped: Array<{ title: string; why: string }> = [];

    for (const song of setlist.songs) {
      if (!song.presetPath) {
        skipped.push({
          title: song.title,
          why: song.presetUrl
            ? "a link was pasted but the preset was never downloaded"
            : "no preset chosen",
        });
        continue;
      }
      try {
        const hlx = await readFile(path.join(PRESET_DIR, song.presetPath), "utf8");

        // Ship the preset exactly as downloaded. SoundPath is the source of
        // truth for levels now, and it needs the unlevelled original as the
        // baseline the recordings were made against.
        presets.push({ name: song.title, hlx, songId: song.id });
      } catch {
        skipped.push({ title: song.title, why: "its preset file is missing" });
      }
    }

    if (presets.length === 0) {
      return NextResponse.json(
        { error: "No downloaded presets in this setlist yet" },
        { status: 400 }
      );
    }

    if (skipped.length > 0) {
      // Refuse rather than hand over a partial gig. A file that is quietly
      // missing two songs is worse than one that doesn't arrive.
      return NextResponse.json(
        {
          error: `${skipped.length} song${skipped.length === 1 ? "" : "s"} can't be sent to SoundPath: ${skipped
            .map((s) => `${s.title} — ${s.why}`)
            .join("; ")}. Levels are averaged across the whole gig, so sending the rest would produce a file that looks complete and isn't.`,
          skipped,
        },
        { status: 409 }
      );
    }

    const res = await fetch(`${SOUNDPATH}/api/setlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setlistId: setlist.id, name: setlist.name, presets }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return NextResponse.json(
        { error: String(data?.error ?? `SoundPath returned ${res.status}`) },
        { status: 502 }
      );
    }

    // Land on the Setlist tab. A whole gig arrived, so the per-preset leveller
    // isn't the question you came with.
    return NextResponse.json({
      ok: true,
      count: presets.length,
      url: `${SOUNDPATH_PUBLIC}/setlist?id=${setlist.id}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach SoundPath";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
