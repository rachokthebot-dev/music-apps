import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const folders = await prisma.folder.findMany({
    // Most recently created or changed first. A folder counts as changed when
    // it is renamed or a song joins, leaves or moves within it.
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { songFolders: true } } },
  });
  return NextResponse.json(folders);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const maxFolder = await prisma.folder.findFirst({
    orderBy: { orderIndex: "desc" },
  });
  const orderIndex = (maxFolder?.orderIndex ?? -1) + 1;

  const folder = await prisma.folder.create({
    data: {
      name: body.name,
      orderIndex,
    },
  });
  return NextResponse.json(folder, { status: 201 });
}
