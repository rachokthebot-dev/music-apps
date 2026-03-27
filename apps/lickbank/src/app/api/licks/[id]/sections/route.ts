import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, startSec, endSec } = await request.json();

    if (!name || startSec == null || endSec == null) {
      return NextResponse.json(
        { error: "name, startSec, and endSec are required" },
        { status: 400 }
      );
    }

    if (startSec < 0 || endSec <= startSec) {
      return NextResponse.json(
        { error: "Invalid time range" },
        { status: 400 }
      );
    }

    const lick = await prisma.lick.findUnique({ where: { id } });
    if (!lick) {
      return NextResponse.json({ error: "Lick not found" }, { status: 404 });
    }

    // Get max orderIndex for this lick
    const maxOrder = await prisma.section.aggregate({
      where: { lickId: id },
      _max: { orderIndex: true },
    });

    const section = await prisma.section.create({
      data: {
        lickId: id,
        name,
        startSec,
        endSec,
        orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
      },
    });

    return NextResponse.json(section, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create section";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
