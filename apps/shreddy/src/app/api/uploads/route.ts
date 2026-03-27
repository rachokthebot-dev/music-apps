import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { UPLOADS_DIR, MAX_FILE_SIZE, ALLOWED_EXTENSIONS } from "@/lib/paths";
import { processAudio } from "@/lib/process-audio";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const analyzeSections = formData.get("analyzeSections") !== "false";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 200MB." },
        { status: 400 }
      );
    }

    // Validate extension
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Invalid file type. Only MP3 and MP4 files are accepted." },
        { status: 400 }
      );
    }

    // Save file to disk
    await mkdir(UPLOADS_DIR, { recursive: true });
    const songId = uuidv4();
    const filename = `${songId}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Derive title from filename (remove extension)
    const title = path.basename(file.name, ext);

    // Create song and import job records
    const song = await prisma.song.create({
      data: {
        id: songId,
        title,
        originalFilename: file.name,
        originalFilePath: filename,
        mimeType: file.type || "application/octet-stream",
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

    // Process in background (don't await)
    processAudio(songId, filePath, { skipSections: !analyzeSections });

    return NextResponse.json(song, { status: 201 });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
