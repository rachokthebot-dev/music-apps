import { NextResponse } from "next/server";
import { SOURCES_DIR, CLIPS_DIR } from "@/lib/paths";
import { stat, open } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
  ".m4a": "audio/mp4",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Prevent directory traversal
    const sanitized = path.basename(filename);
    if (sanitized !== filename) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Check both directories
    let filePath: string | null = null;
    for (const dir of [CLIPS_DIR, SOURCES_DIR]) {
      const candidate = path.join(dir, sanitized);
      try {
        await stat(candidate);
        filePath = candidate;
        break;
      } catch {
        // Not in this directory
      }
    }

    if (!filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileStat = await stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new NextResponse("Invalid range", { status: 416 });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileStat.size - 1;

      if (start >= fileStat.size || end >= fileStat.size) {
        return new NextResponse("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${fileStat.size}` },
        });
      }

      const chunkSize = end - start + 1;
      const fileHandle = await open(filePath, "r");
      const stream = fileHandle.createReadStream({ start, end });

      const readable = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer | string) => controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
        cancel() {
          stream.destroy();
          fileHandle.close();
        },
      });

      return new NextResponse(readable, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
          "Content-Length": chunkSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // No range: stream full file
    const fileHandle = await open(filePath, "r");
    const stream = fileHandle.createReadStream();

    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
        fileHandle.close();
      },
    });

    return new NextResponse(readable, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileStat.size.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to stream file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
