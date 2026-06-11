import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: songId } = await params;
  const body = await request.json();
  const newStart: number = body.startSec;
  const newEnd: number = body.endSec;
  const newName: string = body.name;

  if (newEnd <= newStart) {
    return NextResponse.json({ error: "endSec must be greater than startSec" }, { status: 400 });
  }

  // Get song duration for full coverage enforcement
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { durationSec: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  // Get all existing sections sorted by startSec
  const existing = await prisma.section.findMany({
    where: { songId },
    orderBy: { startSec: "asc" },
  });

  // Compute the resulting section list after overlap resolution
  const toDelete: string[] = [];
  const toUpdate: { id: string; startSec?: number; endSec?: number }[] = [];
  const toCreate: { name: string; startSec: number; endSec: number; autoDetected: boolean }[] = [];

  for (const sec of existing) {
    if (sec.endSec <= newStart || sec.startSec >= newEnd) {
      // No overlap — keep as-is
      continue;
    }

    if (sec.startSec >= newStart && sec.endSec <= newEnd) {
      // Fully covered — delete
      toDelete.push(sec.id);
    } else if (sec.startSec < newStart && sec.endSec > newEnd) {
      // New section lands in the middle — split existing into two
      // Trim existing to be the "before" part
      toUpdate.push({ id: sec.id, endSec: newStart });
      // Create the "after" part
      toCreate.push({
        name: sec.name,
        startSec: newEnd,
        endSec: sec.endSec,
        autoDetected: sec.autoDetected,
      });
    } else if (sec.startSec < newStart) {
      // Overlaps on the left — trim existing's end
      toUpdate.push({ id: sec.id, endSec: newStart });
    } else {
      // Overlaps on the right — trim existing's start
      toUpdate.push({ id: sec.id, startSec: newEnd });
    }
  }

  // Execute all changes in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete fully covered sections
    if (toDelete.length > 0) {
      await tx.section.deleteMany({ where: { id: { in: toDelete } } });
    }

    // Update trimmed sections
    for (const upd of toUpdate) {
      await tx.section.update({
        where: { id: upd.id },
        data: {
          ...(upd.startSec !== undefined && { startSec: upd.startSec }),
          ...(upd.endSec !== undefined && { endSec: upd.endSec }),
        },
      });
    }

    // Create the new manual section
    await tx.section.create({
      data: {
        songId,
        name: newName,
        startSec: newStart,
        endSec: newEnd,
        orderIndex: 0, // Will be recomputed below
        autoDetected: false,
      },
    });

    // Create split-off sections
    for (const cr of toCreate) {
      await tx.section.create({
        data: {
          songId,
          name: cr.name,
          startSec: cr.startSec,
          endSec: cr.endSec,
          orderIndex: 0, // Will be recomputed below
          autoDetected: cr.autoDetected,
        },
      });
    }

    // Recompute orderIndex for all sections based on startSec
    const allSections = await tx.section.findMany({
      where: { songId },
      orderBy: { startSec: "asc" },
    });
    for (let i = 0; i < allSections.length; i++) {
      if (allSections[i].orderIndex !== i) {
        await tx.section.update({
          where: { id: allSections[i].id },
          data: { orderIndex: i },
        });
      }
    }

    // Enforce full coverage: first section starts at 0, last ends at duration
    if (allSections.length > 0 && song.durationSec) {
      const first = allSections[0];
      const last = allSections[allSections.length - 1];
      if (first.startSec !== 0) {
        await tx.section.update({
          where: { id: first.id },
          data: { startSec: 0 },
        });
      }
      if (last.endSec !== song.durationSec) {
        await tx.section.update({
          where: { id: last.id },
          data: { endSec: song.durationSec },
        });
      }
    }
  });

  // Return the updated section list
  const sections = await prisma.section.findMany({
    where: { songId },
    orderBy: { startSec: "asc" },
  });
  return NextResponse.json(sections, { status: 201 });
}
