import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ["endedAt", "durationSec", "tempo"];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        data[field] = field === "endedAt" ? new Date(body[field]) : body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const session = await prisma.practiceSession.update({
      where: { id },
      data,
    });

    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
