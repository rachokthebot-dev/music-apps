import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const folders = await prisma.folder.findMany({
      orderBy: { orderIndex: "asc" },
      include: {
        _count: { select: { licks: true } },
      },
    });

    return NextResponse.json(folders);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list folders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const maxOrder = await prisma.folder.aggregate({
      _max: { orderIndex: true },
    });

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
      },
      include: {
        _count: { select: { licks: true } },
      },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
