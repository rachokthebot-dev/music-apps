/**
 * POST /api/master/open-in-hx-edit
 *
 * Mac-only convenience: shells out to `open -a "HX Edit" <path>` so the
 * patched preset opens directly in HX Edit without a Finder round-trip.
 *
 * Only works from the Mac that's running the server — calling this from the
 * other Mac via the LAN URL opens HX Edit *on the server's Mac*, which is
 * usually not what you want. The button is disabled in the UI when the
 * request origin isn't localhost.
 */

import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { ALIGNED_OUTPUT_PATH } from "@/lib/masterStore";

const pExec = promisify(exec);

export const dynamic = "force-dynamic";

export async function POST() {
  if (!existsSync(ALIGNED_OUTPUT_PATH)) {
    return Response.json(
      { ok: false, error: "no aligned output yet — click Apply first" },
      { status: 404 }
    );
  }
  try {
    // -g keeps HX Edit from grabbing focus if it's already open; remove if you'd
    // rather it come to the front each time.
    await pExec(`open -a "HX Edit" ${JSON.stringify(ALIGNED_OUTPUT_PATH)}`);
    return Response.json({ ok: true, opened: ALIGNED_OUTPUT_PATH });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
