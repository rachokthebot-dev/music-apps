import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const sessionPatchSchema = z.object({
  endedAt: z.string().datetime().optional(),
  durationSec: z.number().int().min(0).optional(),
  tempo: z.number().min(0.1).max(5).optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const raw = await request.json();
    const parsed = sessionPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const body = parsed.data;

    const data: Record<string, unknown> = {};
    if (body.endedAt !== undefined) data.endedAt = new Date(body.endedAt);
    if (body.durationSec !== undefined) data.durationSec = body.durationSec;
    if (body.tempo !== undefined) data.tempo = body.tempo;

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
