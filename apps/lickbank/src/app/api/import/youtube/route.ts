import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchVideoMeta, downloadAndProcess } from "@/lib/youtube-download";

const YOUTUBE_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/;

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || !YOUTUBE_REGEX.test(url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Check if source already exists for this URL
    const existing = await prisma.source.findFirst({
      where: { youtubeUrl: url },
      include: { importJob: true },
    });

    if (existing) {
      return NextResponse.json(
        { source: existing, importJob: existing.importJob },
        { status: 200 }
      );
    }

    // Fetch metadata
    const meta = await fetchVideoMeta(url);

    // Create source + import job
    const source = await prisma.source.create({
      data: {
        title: meta.title,
        artist: meta.artist,
        youtubeUrl: url,
        thumbnailUrl: meta.thumbnail,
        durationSec: meta.duration,
        processingStatus: "processing",
        importJob: {
          create: {
            status: "pending",
            progressMessage: "Starting download...",
          },
        },
      },
      include: { importJob: true },
    });

    // Start download in background (don't await)
    downloadAndProcess(source.id, url);

    return NextResponse.json(
      { source, importJob: source.importJob },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
