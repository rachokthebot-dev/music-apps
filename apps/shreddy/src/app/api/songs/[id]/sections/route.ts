import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: songId } = await params;
  const body = await request.json();

  // Get next order index
  const maxSection = await prisma.section.findFirst({
    where: { songId },
    orderBy: { orderIndex: "desc" },
  });
  const orderIndex = (maxSection?.orderIndex ?? -1) + 1;

  const section = await prisma.section.create({
    data: {
      songId,
      name: body.name,
      startSec: body.startSec,
      endSec: body.endSec,
      orderIndex,
    },
  });
  return NextResponse.json(section, { status: 201 });
}
