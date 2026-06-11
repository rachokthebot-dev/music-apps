import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { licks: true } },
        folders: {
          orderBy: { orderIndex: "asc" },
          include: { folder: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json(sources);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
