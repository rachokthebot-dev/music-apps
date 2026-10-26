import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const folder = await prisma.folder.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.orderIndex !== undefined && { orderIndex: body.orderIndex }),
    },
  });
  return NextResponse.json(folder);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Only the folder and its memberships go — the songs stay in the library.
  // Explicit rather than trusting the schema's cascade, which needs SQLite's
  // foreign_keys pragma to be on.
  await prisma.$transaction([
    prisma.songFolder.deleteMany({ where: { folderId: id } }),
    prisma.folder.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
