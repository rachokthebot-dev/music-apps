import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const sessionPatchSchema = z.object({
  endedAt: z.string().datetime().optional(),
  durationSec: z.number().int().min(0).optional(),
  tempo: z.number().min(0.1).max(5).optional(),
  pitch: z.number().int().min(-12).max(12).optional(),
}).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await request.json();
  const parsed = sessionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
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
