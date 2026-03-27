import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const folders = await prisma.folder.findMany({
    orderBy: { orderIndex: "asc" },
    include: { _count: { select: { songs: true } } },
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
