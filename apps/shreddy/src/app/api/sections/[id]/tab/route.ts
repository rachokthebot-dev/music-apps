import { NextResponse } from "next/server";
import { extractTabForSection } from "@/lib/extract-tab";

// Extraction is slow on a cold guitar stem (htdemucs_6s over the full song),
// fast afterwards — the stem is cached per song, so later sections of the same
// track return in seconds.
export const maxDuration = 900;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await extractTabForSection(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tab extraction failed";
    console.error(`[tab ${id}]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
