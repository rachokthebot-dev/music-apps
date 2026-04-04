import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { fetchVideoMeta, downloadAndProcess } from "@/lib/youtube-download";
import { readFile } from "fs/promises";
import { SETTINGS_FILE } from "@/lib/paths";

const DEFAULT_MAX_DURATION = 600; // 10 minutes

async function getMaxDuration(): Promise<number> {
  try {
    const data = await readFile(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(data);
    return settings.youtubeMaxDuration ?? DEFAULT_MAX_DURATION;
  } catch {
    return DEFAULT_MAX_DURATION;
  }
}

function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    return (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    );
  } catch {
    return false;
  }
}

// Allow cross-origin requests from LickBank
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url?.trim();
    const analyzeSections = body.analyzeSections !== false;

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400, headers: corsHeaders() });
    }

    if (!isYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "Only YouTube URLs are supported" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Fetch metadata first (validates URL, gets title/duration)
    const meta = await fetchVideoMeta(url);

    // Check duration limit
    const maxDuration = await getMaxDuration();
    if (meta.duration > maxDuration) {
      const maxMin = Math.floor(maxDuration / 60);
      return NextResponse.json(
        { error: `Video is too long (${Math.floor(meta.duration / 60)} min). Maximum is ${maxMin} minutes.` },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Create song and import job
    const songId = uuidv4();
    const song = await prisma.song.create({
      data: {
        id: songId,
        title: meta.title,
        originalFilename: url,
        originalFilePath: "", // will be set after download
        mimeType: "audio/mpeg",
        processingStatus: "pending",
        artist: meta.artist,
        importJob: {
          create: {
            status: "pending",
            progressMessage: "Preparing download...",
          },
        },
      },
      include: { importJob: true },
    });

    // Download and process in background
    downloadAndProcess(songId, url, { skipSections: !analyzeSections });

    return NextResponse.json(song, { status: 201, headers: corsHeaders() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders() });
  }
}
