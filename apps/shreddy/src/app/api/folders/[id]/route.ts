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
  // Unassign songs from this folder before deleting
  await prisma.song.updateMany({
    where: { folderId: id },
    data: { folderId: null },
  });
  await prisma.folder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
