import { NextResponse } from "next/server";
import { AUDIO_DIR } from "@/lib/paths";
import { stat, open } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
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

    const filePath = path.join(AUDIO_DIR, sanitized);
    const fileStat = await stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "audio/mpeg";

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
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
