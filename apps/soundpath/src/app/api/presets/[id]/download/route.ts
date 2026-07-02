/**
 * GET /api/presets/:id/download → streams the stored .hlx as a file download.
 */

import { getPreset } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

function dispositionHeader(fileName: string): string {
  const ascii = fileName.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = await getPreset(id);
  if (!row) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const safeName = row.name.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "preset";
  return new Response(row.hlx, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": dispositionHeader(`${safeName}.hlx`),
    },
  });
}
