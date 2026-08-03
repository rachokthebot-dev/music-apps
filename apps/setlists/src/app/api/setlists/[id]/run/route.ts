import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRun, runSetlist } from "@/lib/run-imports";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const setlist = await prisma.setlist.findUnique({ where: { id } });
  if (!setlist) return NextResponse.json({ error: "Setlist not found" }, { status: 404 });

  if (getRun(id)?.status === "running") {
    return NextResponse.json({ error: "Already running" }, { status: 409 });
  }

  // Downloads take minutes — run in the background and let the client poll GET.
  void runSetlist(id);
  return NextResponse.json({ ok: true, started: true });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(getRun(id) ?? { status: "idle" });
}
