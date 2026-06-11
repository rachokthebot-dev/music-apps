import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { access } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { AUDIO_DIR } from "@/lib/paths";

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

  const sourceFile = path.join(AUDIO_DIR, path.basename(song.normalizedAudioPath));
  try {
    await access(sourceFile);
  } catch {
    return NextResponse.json({ error: "Audio file missing" }, { status: 404 });
  }

  const duration = end - start;
  const ff = spawn("ffmpeg", [
    "-ss", start.toString(),
    "-t", duration.toString(),
    "-i", sourceFile,
    "-vn",
    "-ar", "44100",
    "-ac", "2",
    "-b:a", "192k",
    "-f", "mp3",
    "pipe:1",
  ]);

  const stream = new ReadableStream({
    start(controller) {
      ff.stdout.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      ff.stdout.on("end", () => controller.close());
      ff.stderr.on("data", () => { /* swallow ffmpeg logs */ });
      ff.on("error", (err) => controller.error(err));
      ff.on("close", (code) => {
        if (code !== 0 && code !== null) {
          try { controller.error(new Error(`ffmpeg exited ${code}`)); } catch { /* already closed */ }
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
