interface ExportSection {
  name: string;
  startSec: number;
  endSec: number;
}

interface ExportSongData {
  title: string;
  artist: string;
  musicalKey: string;
  bpm: number | null;
  timeSignature: number;
  durationSec: number | null;
  sections: ExportSection[];
  beatTimestamps: number[];
}

function getBarCount(
  section: { startSec: number; endSec: number },
  beatTimestamps: number[],
  timeSignature: number
): number | null {
  if (!beatTimestamps.length) return null;
  const beats = beatTimestamps.filter(
    (t) => t >= section.startSec && t < section.endSec
  );
  if (beats.length === 0) return null;
  return Math.round(beats.length / timeSignature);
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimeSig(ts: number): string {
  return ts === 6 ? "6/8" : `${ts}/4`;
}

function getTotalBars(song: ExportSongData): number | null {
  if (!song.beatTimestamps.length) return null;
  return Math.round(song.beatTimestamps.length / song.timeSignature);
}

export function copyStructureText(song: ExportSongData): string {
  const totalBars = getTotalBars(song);
  const lines: string[] = [];

  // Header
  const titleLine = song.artist
    ? `${song.artist} - ${song.title}`
    : song.title;
  lines.push(titleLine);

  const metaParts: string[] = [];
  if (song.musicalKey) metaParts.push(`Key: ${song.musicalKey}`);
  if (song.bpm) metaParts.push(`BPM: ${Math.round(song.bpm)}`);
  metaParts.push(`Time: ${formatTimeSig(song.timeSignature)}`);
  lines.push(metaParts.join(" | "));

  const totalParts: string[] = [];
  if (song.durationSec) totalParts.push(`Duration: ${formatDuration(song.durationSec)}`);
  if (totalBars !== null) totalParts.push(`${totalBars} bars total`);
  if (totalParts.length) lines.push(totalParts.join(" | "));

  lines.push("");

  // Section rows
  const maxNameLen = Math.max(...song.sections.map((s) => s.name.length), 4);
  for (const section of song.sections) {
    const name = section.name.padEnd(maxNameLen + 2);
    const time = `${formatTime(section.startSec)} – ${formatTime(section.endSec)}`;
    const bars = getBarCount(section, song.beatTimestamps, song.timeSignature);
    const barStr = bars !== null ? `   ~${bars} bars` : "";
    lines.push(`${name}${time}${barStr}`);
  }

  return lines.join("\n");
}

const SECTION_COLORS = [
  "#a78bfa", "#38bdf8", "#34d399", "#fbbf24", "#fb7185",
  "#22d3ee", "#e879f9", "#a3e635", "#fb923c", "#2dd4bf",
];

export function generateStructureImage(song: ExportSongData): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const PADDING = 32;
  const BLOCK_W = 160;
  const BLOCK_H = 80;
  const BLOCK_GAP = 12;
  const COLS = 4;
  const rows = Math.ceil(song.sections.length / COLS);

  const contentW = COLS * BLOCK_W + (COLS - 1) * BLOCK_GAP;
  const canvasW = contentW + PADDING * 2;
  const headerH = 100;
  const footerH = 40;
  const blocksH = rows * BLOCK_H + (rows - 1) * BLOCK_GAP;
  const canvasH = headerH + blocksH + footerH + PADDING * 2;

  canvas.width = canvasW;
  canvas.height = canvasH;

  // Background
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Border
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);

  // Title
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(song.title, PADDING, PADDING + 24);

  // Artist
  if (song.artist) {
    ctx.fillStyle = "#999";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(song.artist, PADDING, PADDING + 46);
  }

  // Meta line
  const totalBars = getTotalBars(song);
  const metaParts: string[] = [];
  if (song.musicalKey) metaParts.push(`Key: ${song.musicalKey}`);
  if (song.bpm) metaParts.push(`BPM: ${Math.round(song.bpm)}`);
  metaParts.push(formatTimeSig(song.timeSignature));
  if (song.durationSec) metaParts.push(formatDuration(song.durationSec));
  if (totalBars !== null) metaParts.push(`${totalBars} bars`);

  ctx.fillStyle = "#777";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(metaParts.join("  ·  "), PADDING, PADDING + 66);

  // Section blocks
  const blocksStartY = PADDING + headerH;

  for (let i = 0; i < song.sections.length; i++) {
    const section = song.sections[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (BLOCK_W + BLOCK_GAP);
    const y = blocksStartY + row * (BLOCK_H + BLOCK_GAP);
    const color = SECTION_COLORS[i % SECTION_COLORS.length];

    // Block background
    ctx.fillStyle = "#262626";
    ctx.beginPath();
    ctx.roundRect(x, y, BLOCK_W, BLOCK_H, 6);
    ctx.fill();

    // Left color accent
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, 4, BLOCK_H, [6, 0, 0, 6]);
    ctx.fill();

    // Section name
    ctx.fillStyle = "#f5f5f5";
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    const displayName = section.name.length > 16 ? section.name.slice(0, 15) + "…" : section.name;
    ctx.fillText(displayName, x + 12, y + 22);

    // Bar count
    const bars = getBarCount(section, song.beatTimestamps, song.timeSignature);
    if (bars !== null) {
      ctx.fillStyle = "#ccc";
      ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(`~${bars} ${bars === 1 ? "bar" : "bars"}`, x + 12, y + 42);
    }

    // Duration
    const durSec = section.endSec - section.startSec;
    ctx.fillStyle = "#777";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatTime(durSec), x + 12, y + 60);

    // Time range (right aligned)
    ctx.textAlign = "right";
    ctx.fillStyle = "#555";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`${formatTime(section.startSec)}–${formatTime(section.endSec)}`, x + BLOCK_W - 8, y + 60);
    ctx.textAlign = "left";
  }

  // Footer
  ctx.fillStyle = "#555";
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Generated by Shreddy", PADDING, canvasH - 16);

  // Download
  const link = document.createElement("a");
  const safeTitle = song.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  link.download = `${safeTitle}-structure.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
