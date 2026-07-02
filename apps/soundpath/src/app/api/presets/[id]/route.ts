/**
 * GET    /api/presets/:id   → full record including the .hlx payload
 * PATCH  /api/presets/:id   → rename and/or toggle favorite
 * DELETE /api/presets/:id   → remove from the Library
 */

import { prisma } from "@/lib/prisma";
import { getPreset, serializePreset } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await getPreset(id);
    if (!row) {
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return Response.json({ ok: true, preset: serializePreset(row, true) });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { name?: string; favorite?: boolean };

    const data: { name?: string; favorite?: boolean } = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().slice(0, 120);
    }
    if (typeof body.favorite === "boolean") {
      data.favorite = body.favorite;
    }
    if (Object.keys(data).length === 0) {
      return Response.json(
        { ok: false, error: "nothing to update (name or favorite)" },
        { status: 400 }
      );
    }

    const row = await prisma.generatedPreset.update({ where: { id }, data });
    return Response.json({ ok: true, preset: serializePreset(row) });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await prisma.generatedPreset.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
