import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { copyFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { UPLOADS_DIR, AUDIO_DIR } from "@/lib/paths";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const song = await prisma.song.findUnique({
    where: { id },
    include: { sections: { orderBy: { orderIndex: "asc" } } },
  });

  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const newId = uuidv4();

  // Copy audio file
  if (song.normalizedAudioPath) {
    const srcAudio = path.join(AUDIO_DIR, song.normalizedAudioPath);
    const newAudioFilename = `${newId}.mp3`;
    const destAudio = path.join(AUDIO_DIR, newAudioFilename);
    try {
      await copyFile(srcAudio, destAudio);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to copy audio file" },
        { status: 500 }
      );
    }
  }

  // Copy original upload file (if it still exists)
  if (song.originalFilePath) {
    const srcUpload = path.join(UPLOADS_DIR, song.originalFilePath);
    const ext = path.extname(song.originalFilePath);
    const newUploadFilename = `${newId}${ext}`;
    const destUpload = path.join(UPLOADS_DIR, newUploadFilename);
    try {
      await copyFile(srcUpload, destUpload);
    } catch {
      // Original may have been cleaned up — not critical
    }
  }

  // Create new song (in root folder, no practice history)
  const newSong = await prisma.song.create({
    data: {
      id: newId,
      title: `${song.title} (Copy)`,
      originalFilename: song.originalFilename,
      originalFilePath: `${newId}${path.extname(song.originalFilePath || ".mp3")}`,
      normalizedAudioPath: song.normalizedAudioPath ? `${newId}.mp3` : null,
      mimeType: song.mimeType,
      durationSec: song.durationSec,
      processingStatus: song.processingStatus,
      bpm: song.bpm,
      artist: song.artist,
      album: song.album,
      genre: song.genre,
      year: song.year,
      // No folder (root), no pinned, no notes, no last position
      sections: {
        create: song.sections.map((s) => ({
          name: s.name,
          startSec: s.startSec,
          endSec: s.endSec,
          orderIndex: s.orderIndex,
          autoDetected: s.autoDetected,
        })),
      },
    },
    include: { sections: true },
  });

  return NextResponse.json(newSong, { status: 201 });
}
