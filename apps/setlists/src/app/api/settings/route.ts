import { NextResponse } from "next/server";
import { SETTING_KEYS, getSetting, setSetting } from "@/lib/settings";

/**
 * The password is never sent back — only whether one is stored. Otherwise
 * anything that can read this route can read the credential.
 */
export async function GET() {
  const [email, password] = await Promise.all([
    getSetting(SETTING_KEYS.toneCloudEmail),
    getSetting(SETTING_KEYS.toneCloudPassword),
  ]);
  return NextResponse.json({
    toneCloudEmail: email ?? "",
    toneCloudPasswordSet: Boolean(password),
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (typeof body?.toneCloudEmail === "string") {
      await setSetting(SETTING_KEYS.toneCloudEmail, body.toneCloudEmail.trim());
    }
    // An empty string clears it; undefined leaves the stored one alone, so
    // saving the form without retyping the password doesn't wipe it.
    if (typeof body?.toneCloudPassword === "string") {
      await setSetting(SETTING_KEYS.toneCloudPassword, body.toneCloudPassword);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
