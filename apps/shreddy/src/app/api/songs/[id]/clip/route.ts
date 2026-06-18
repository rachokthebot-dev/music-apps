import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { access } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { AUDIO_DIR } from "@/lib/paths";
import { STEM_NAMES, type StemName } from "@/lib/stems-engine";
import { stemFilename } from "@/lib/process-stems";

// GET /api/songs/[id]/clip?start=…&end=…&stems=vocals,drums,bass,other
//
// `start`/`end` (seconds) clip the audio to a section range.
// `stems` (optional, comma-separated) selects which stems to mix in. When
// present, the clip is rendered from the chosen stems instead of the full
// mix — used by the Share button to extract a "drums + bass only" backing
// track, or any other partial mix the user assembles via the stems menu.
// When all 4 stems are listed (or `stems` omitted), the existing fast path
// streams the normalized full-mix file.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) {
    return NextResponse.json({ error: "Invalid start/end" }, { status: 400 });
  }

  const song = await prisma.song.findUnique({ where: { id } });
  if (!song?.normalizedAudioPath) {
    return NextResponse.json({ error: "Song audio not found" }, { status: 404 });
  }

  // Parse the optional stems param. Validate each entry against the known
  // names so a typo / malicious value can't reach ffmpeg as a file path.
  const stemsParam = url.searchParams.get("stems");
  const requestedStems: StemName[] = stemsParam
    ? (stemsParam.split(",").filter((s) =>
        (STEM_NAMES as readonly string[]).includes(s)
      ) as StemName[])
    : [];
  const useStemMix =
    requestedStems.length > 0 && requestedStems.length < STEM_NAMES.length;

  // Build the ffmpeg argv. Two flavours:
  //   * Full-mix path: -i <normalized.mp3>, copy stream.
  //   * Stem-mix path: -i each selected stem, amix=normalize=0 to preserve
  //     levels (default normalize divides by N, which makes 2 stems half
  //     as loud as the original).
  let ffmpegArgs: string[];
  const duration = end - start;

  if (useStemMix) {
    if (song.stemsState !== "ready") {
      return NextResponse.json(
        { error: "Stems not ready for this song" },
        { status: 409 }
      );
    }
    const stemFiles: string[] = [];
    for (const s of requestedStems) {
      const fname = stemFilename(id, s);
      const fpath = path.join(AUDIO_DIR, fname);
      try {
        await access(fpath);
      } catch {
        return NextResponse.json(
          { error: `Stem file missing: ${s}` },
          { status: 404 }
        );
      }
      stemFiles.push(fpath);
    }

    const inputArgs: string[] = [];
    for (const f of stemFiles) {
      inputArgs.push("-ss", start.toString(), "-t", duration.toString(), "-i", f);
    }
    const mixInputs = stemFiles
      .map((_f, i) => `[${i}:a]`)
      .join("");
    const filter = `${mixInputs}amix=inputs=${stemFiles.length}:duration=longest:normalize=0`;
    ffmpegArgs = [
      ...inputArgs,
      "-filter_complex",
      filter,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      "192k",
      "-f",
      "mp3",
      "pipe:1",
    ];
  } else {
    const sourceFile = path.join(
      AUDIO_DIR,
      path.basename(song.normalizedAudioPath)
    );
    try {
      await access(sourceFile);
    } catch {
      return NextResponse.json({ error: "Audio file missing" }, { status: 404 });
    }
    ffmpegArgs = [
      "-ss",
      start.toString(),
      "-t",
      duration.toString(),
      "-i",
      sourceFile,
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      "192k",
      "-f",
      "mp3",
      "pipe:1",
    ];
  }

  const ff = spawn("ffmpeg", ffmpegArgs);

  const stream = new ReadableStream({
    start(controller) {
      ff.stdout.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      ff.stdout.on("end", () => controller.close());
      ff.stderr.on("data", () => {
        /* swallow ffmpeg logs */
      });
      ff.on("error", (err) => controller.error(err));
      ff.on("close", (code) => {
        if (code !== 0 && code !== null) {
          try {
            controller.error(new Error(`ffmpeg exited ${code}`));
          } catch {
            /* already closed */
          }
        }
      });
    },
    cancel() {
      ff.kill("SIGKILL");
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
