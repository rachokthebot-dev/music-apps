import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const sectionPatchSchema = z.object({
  name: z.string().min(1).optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const raw = await request.json();
    const parsed = sectionPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const body = parsed.data;

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.startSec !== undefined) data.startSec = body.startSec;
    if (body.endSec !== undefined) data.endSec = body.endSec;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const section = await prisma.section.update({
      where: { id },
      data,
    });

    return NextResponse.json(section);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update section";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.section.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete section";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
