import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { SETTINGS_FILE } from "@/lib/paths";

interface Settings {
  youtubeMaxDuration?: number;  // seconds, default 600 (10 min)
  analyzeOnImport?: boolean;    // default for the "Analyze structure" toggle on import
  combineSubsections?: boolean; // default true — merge adjacent same-label SongFormer segments
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
  return NextResponse.json({
    youtubeMaxDuration: settings.youtubeMaxDuration ?? 600,
    analyzeOnImport: settings.analyzeOnImport ?? false,
    combineSubsections: settings.combineSubsections ?? true,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const current = await readSettings();
  const updated = { ...current, ...body };
  await writeSettings(updated);
  return NextResponse.json({
    youtubeMaxDuration: updated.youtubeMaxDuration ?? 600,
    analyzeOnImport: updated.analyzeOnImport ?? false,
    combineSubsections: updated.combineSubsections ?? true,
  });
}
