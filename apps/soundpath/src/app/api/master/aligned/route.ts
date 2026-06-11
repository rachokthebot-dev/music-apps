/**
 * GET  /api/master/aligned          — download the last patched output as a file
 * POST /api/master/aligned/open     — open the patched file in HX Edit (local only)
 */

import { existsSync, readFileSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { ALIGNED_OUTPUT_PATH, readActiveMaster } from "@/lib/masterStore";

const pExec = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET() {
  if (!existsSync(ALIGNED_OUTPUT_PATH)) {
    return Response.json(
      { ok: false, error: "no aligned output yet — click Apply first" },
      { status: 404 }
    );
  }
  const body = readFileSync(ALIGNED_OUTPUT_PATH, "utf-8");
  const masterName = (() => {
    try {
      return readActiveMaster().data.meta.name || "preset";
    } catch {
      return "preset";
    }
  })();
  const fileName = `${masterName} — aligned.hlx`;
  const ascii = fileName.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(fileName);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
    },
  });
}
