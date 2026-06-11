import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const sectionPatchSchema = z.object({
  name: z.string().min(1).optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
  orderIndex: z.number().int().min(0).optional(),
  masteryRating: z.number().int().min(0).max(5).nullable().optional(),
}).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await request.json();
  const parsed = sectionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  // Any user edit to name/start/end flips autoDetected → false so a future
  // re-analyze preserves the manual change. masteryRating alone is metadata
  // and does not affect this flag.
  const isStructuralEdit =
    body.name !== undefined ||
    body.startSec !== undefined ||
    body.endSec !== undefined;

  const section = await prisma.section.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.startSec !== undefined && { startSec: body.startSec }),
      ...(body.endSec !== undefined && { endSec: body.endSec }),
      ...(body.orderIndex !== undefined && { orderIndex: body.orderIndex }),
      ...(body.masteryRating !== undefined && { masteryRating: body.masteryRating }),
      ...(isStructuralEdit && { autoDetected: false }),
    },
  });
  return NextResponse.json(section);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Find the section being deleted and its song's sections
  const section = await prisma.section.findUnique({ where: { id } });
  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const siblings = await prisma.section.findMany({
    where: { songId: section.songId },
    orderBy: { startSec: "asc" },
  });

  // Don't allow deleting the last remaining section
  if (siblings.length <= 1) {
    return NextResponse.json({ error: "Cannot delete the only section" }, { status: 400 });
  }

  const idx = siblings.findIndex(s => s.id === id);

  await prisma.$transaction(async (tx) => {
    // Delete the section
    await tx.section.delete({ where: { id } });

    if (idx > 0) {
      // Merge into previous section: expand previous's endSec
      const prev = siblings[idx - 1];
      await tx.section.update({
        where: { id: prev.id },
        data: { endSec: section.endSec },
      });
    } else {
      // Deleting the first section: expand next section's startSec to 0
      const next = siblings[idx + 1];
      await tx.section.update({
        where: { id: next.id },
        data: { startSec: section.startSec },
      });
    }

    // Recompute orderIndex
    const remaining = await tx.section.findMany({
      where: { songId: section.songId },
      orderBy: { startSec: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].orderIndex !== i) {
        await tx.section.update({
          where: { id: remaining[i].id },
          data: { orderIndex: i },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
