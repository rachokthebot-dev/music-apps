import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { SETTINGS_FILE } from "@/lib/paths";

interface Settings {
  analysisPrompt?: string;
  youtubeMaxDuration?: number; // seconds, default 600 (10 min)
  anthropicApiKey?: string;
}

async function readSettings(): Promise<Settings> {
  try {
    const data = await readFile(SETTINGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export async function GET() {
  const settings = await readSettings();
  // Mask API key for frontend display — only show last 4 chars
  const masked = { ...settings };
  if (masked.anthropicApiKey) {
    masked.anthropicApiKey = "sk-......" + masked.anthropicApiKey.slice(-4);
  }
  // Also indicate if env var is set
  return NextResponse.json({
    ...masked,
    hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const current = await readSettings();

  // If anthropicApiKey is being set, update the env var for the running process
  if (body.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = body.anthropicApiKey;
  }

  const updated = { ...current, ...body };
  await writeSettings(updated);

  // Return masked version
  const masked = { ...updated };
  if (masked.anthropicApiKey) {
    masked.anthropicApiKey = "sk-......" + masked.anthropicApiKey.slice(-4);
  }
  return NextResponse.json({ ...masked, hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY });
}
