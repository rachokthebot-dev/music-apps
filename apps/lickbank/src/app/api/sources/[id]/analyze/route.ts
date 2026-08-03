import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  analyzeSource,
  startAnalysis,
  getAnalyzeJob,
  getRunningModelRun,
} from "@/lib/analyze-source";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "model" ? "model" : "chapters";

    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (getAnalyzeJob(id)?.status === "running") {
      return NextResponse.json(
        { error: "Analysis is already running for this source" },
        { status: 409 }
      );
    }

    if (mode === "model") {
      // One model run at a time machine-wide: two at once starve each other
      // into the timeout, and it looks like the model failed.
      const inFlight = getRunningModelRun();
      if (inFlight) {
        const other = await prisma.source.findUnique({
          where: { id: inFlight.sourceId },
          select: { title: true },
        });
        return NextResponse.json(
          {
            error: `The local model is already analyzing "${other?.title ?? "another source"}". Wait for it to finish — two runs at once starve each other.`,
          },
          { status: 409 }
        );
      }
      if (!source.audioPath) {
        return NextResponse.json(
          { error: "No audio for this source — nothing for the model to read" },
          { status: 400 }
        );
      }
      // Minutes of CPU on a long video — run in the background and let the
      // client poll GET on this route.
      startAnalysis(id, "model");
      return NextResponse.json({ ok: true, pending: true });
    }

    // Chapters are one yt-dlp call capped at 30 s — fast enough to answer in
    // the request, so the client gets a real count instead of polling blind.
    const count = await analyzeSource(id, "chapters");
    return NextResponse.json({ ok: true, pending: false, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getAnalyzeJob(id);
  if (job) return NextResponse.json(job);

  // The dev server drops the job map on every hot reload, but the child keeps
  // running and still writes its sections. Report it as running rather than
  // letting the client conclude the analysis finished with nothing.
  const live = getRunningModelRun();
  if (live?.sourceId === id) {
    return NextResponse.json({ status: "running", mode: "model", recovered: true });
  }
  return NextResponse.json({ status: "idle" });
}
