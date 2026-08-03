import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const setlist = await prisma.setlist.findUnique({
    where: { id },
    include: {
      songs: {
        orderBy: { orderIndex: "asc" },
        include: { snapshots: { orderBy: { index: "asc" } } },
      },
    },
  });
  if (!setlist) return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
  return NextResponse.json(setlist);
}

/** Setlist-level fields only — the four global levels and the anchor role. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const data: Record<string, string | number> = {};
    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    for (const key of [
      "referenceLufs",
      "rhythmOffsetDb",
      "chorusOffsetDb",
      "soloOffsetDb",
    ] as const) {
      if (typeof body?.[key] === "number" && Number.isFinite(body[key])) data[key] = body[key];
    }
    if (["clean", "rhythm", "chorus", "solo"].includes(body?.anchorRole)) {
      data.anchorRole = body.anchorRole;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const setlist = await prisma.setlist.update({ where: { id }, data });
    return NextResponse.json(setlist);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update setlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.setlist.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete setlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
