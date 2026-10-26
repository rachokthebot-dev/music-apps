import { NextResponse } from "next/server";
import { getAutoLickJob } from "@/lib/auto-licks";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(getAutoLickJob(id) ?? { status: "idle" });
}
