// GET /api/songs/[id]/stems
//
// Lazy-polled status endpoint for the R5 stems pipeline. The practice page
// polls this until `state` flips to "ready", at which point it loads the
// 4 stem URLs into the StemsEngine.
//
// Shape:
//   { state: "pending" | "processing" | "ready" | "error",
//     errorMessage: string | null,
//     stems?: { vocals, drums, bass, other }    // present when state="ready"
//   }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stemFilename } from "@/lib/process-stems";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const song = await prisma.song.findUnique({
    where: { id },
    select: { stemsState: true, stemsErrorMessage: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const body: {
    state: string;
    errorMessage: string | null;
    stems?: Record<string, string>;
  } = {
    state: song.stemsState,
    errorMessage: song.stemsErrorMessage,
  };

  if (song.stemsState === "ready") {
    body.stems = {
      vocals: `/shreddy/api/media/${stemFilename(id, "vocals")}`,
      drums: `/shreddy/api/media/${stemFilename(id, "drums")}`,
      bass: `/shreddy/api/media/${stemFilename(id, "bass")}`,
      other: `/shreddy/api/media/${stemFilename(id, "other")}`,
    };
  }

  return NextResponse.json(body);
}
