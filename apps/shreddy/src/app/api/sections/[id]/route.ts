import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
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
