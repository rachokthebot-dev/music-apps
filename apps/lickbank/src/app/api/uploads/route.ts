import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { TMP_DIR, MAX_FILE_SIZE, ALLOWED_EXTENSIONS } from "@/lib/paths";
import { processUpload } from "@/lib/process-upload";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500MB." },
        { status: 400 }
      );
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Invalid file type. Only MP3 and MP4 files are accepted." },
        { status: 400 }
      );
    }

    // Save to tmp dir
    await mkdir(TMP_DIR, { recursive: true });
    const sourceId = uuidv4();
    const tmpFilename = `${sourceId}${ext}`;
    const tmpPath = path.join(TMP_DIR, tmpFilename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buffer);

    // Derive title from filename
    const title = path.basename(file.name, ext);

    // Create source and import job
    const source = await prisma.source.create({
      data: {
        id: sourceId,
        title,
        youtubeUrl: `file://${file.name}`,
        processingStatus: "pending",
        importJob: {
          create: {
            status: "pending",
            progressMessage: "Queued for processing",
          },
        },
      },
      include: { importJob: true },
    });

    // Process in background
    processUpload(sourceId, tmpPath, file.name);

    return NextResponse.json(source, { status: 201 });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
