import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const session = await prisma.practiceSession.update({
    where: { id },
    data: {
      ...(body.endedAt !== undefined && { endedAt: new Date(body.endedAt) }),
      ...(body.durationSec !== undefined && { durationSec: body.durationSec }),
      ...(body.tempo !== undefined && { tempo: body.tempo }),
      ...(body.pitch !== undefined && { pitch: body.pitch }),
    },
  });
  return NextResponse.json(session);
}
