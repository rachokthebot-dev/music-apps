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
  const section = await prisma.section.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.startSec !== undefined && { startSec: body.startSec }),
      ...(body.endSec !== undefined && { endSec: body.endSec }),
      ...(body.orderIndex !== undefined && { orderIndex: body.orderIndex }),
      ...(body.masteryRating !== undefined && { masteryRating: body.masteryRating }),
    },
  });
  return NextResponse.json(section);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.section.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
