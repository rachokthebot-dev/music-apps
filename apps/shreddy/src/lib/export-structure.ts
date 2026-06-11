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

function getBarTimestamps(
  section: { startSec: number; endSec: number },
  beatTimestamps: number[],
  timeSignature: number
): number[][] {
  const beats = beatTimestamps.filter(
    (t) => t >= section.startSec && t < section.endSec
  );
  const bars: number[][] = [];
  for (let i = 0; i < beats.length; i += timeSignature) {
    bars.push(beats.slice(i, i + timeSignature));
  }
  return bars;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function copyStructureText(song: ExportSongData): string {
  return song.sections
    .map((s) => `${formatTime(s.startSec)}-${formatTime(s.endSec)} ${s.name}`)
    .join("\n");
}

export function copyStructureCSV(song: ExportSongData): string {
  const rows: string[] = ["bar,section,start_time,end_time"];
  let globalBar = 1;

  for (const section of song.sections) {
    const sectionBars = getBarTimestamps(section, song.beatTimestamps, song.timeSignature);

    if (sectionBars.length === 0) {
      // No beat data — one row per section
      rows.push(`${globalBar},${escapeCSV(section.name)},${formatTime(section.startSec)},${formatTime(section.endSec)}`);
      globalBar++;
      continue;
    }

    for (let i = 0; i < sectionBars.length; i++) {
      const barStart = sectionBars[i][0];
      const barEnd = i + 1 < sectionBars.length
        ? sectionBars[i + 1][0]
        : section.endSec;
      rows.push(`${globalBar},${escapeCSV(section.name)},${formatTime(barStart)},${formatTime(barEnd)}`);
      globalBar++;
    }
  }

  return rows.join("\n");
}

const SECTION_COLORS = [
  "#a78bfa", "#38bdf8", "#34d399", "#fbbf24", "#fb7185",
  "#22d3ee", "#e879f9", "#a3e635", "#fb923c", "#2dd4bf",
];

function getSectionWeight(
  section: ExportSection,
  beatTimestamps: number[],
  timeSignature: number
): number {
  const bars = getBarCount(section, beatTimestamps, timeSignature);
  if (bars !== null && bars > 0) return bars;
  // Fallback: duration-proportional (1 unit per 3 seconds)
  return Math.max(1, Math.round((section.endSec - section.startSec) / 3));
}

interface LayoutRow {
  sections: { section: ExportSection; idx: number; weight: number; width: number }[];
}

function computeLayout(
  sections: ExportSection[],
  beatTimestamps: number[],
  timeSignature: number,
  contentW: number,
  gap: number,
  minW: number
): LayoutRow[] {
  const weighted = sections.map((s, i) => ({
    section: s,
    idx: i,
    weight: getSectionWeight(s, beatTimestamps, timeSignature),
    width: 0,
  }));

  // Flow sections into rows
  const rows: LayoutRow[] = [];
  let currentRow: typeof weighted = [];
  let currentWeight = 0;

  // Target: aim for rows that have roughly similar total weight
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const targetRowWeight = Math.max(totalWeight / Math.ceil(sections.length / 4), 8);

  for (const item of weighted) {
    currentRow.push(item);
    currentWeight += item.weight;
    if (currentWeight >= targetRowWeight && currentRow.length >= 2) {
      rows.push({ sections: currentRow });
      currentRow = [];
      currentWeight = 0;
    }
  }
  if (currentRow.length > 0) {
    rows.push({ sections: currentRow });
  }

  // Allocate widths per row proportionally
  for (const row of rows) {
    const totalGap = (row.sections.length - 1) * gap;
    const availableW = contentW - totalGap;
    const rowWeight = row.sections.reduce((s, item) => s + item.weight, 0);

    // First pass: proportional allocation
    for (const item of row.sections) {
      item.width = Math.max(minW, Math.round((item.weight / rowWeight) * availableW));
    }

    // Adjust to fit exactly
    const totalAllocated = row.sections.reduce((s, item) => s + item.width, 0);
    const diff = availableW - totalAllocated;
    if (diff !== 0 && row.sections.length > 0) {
      // Distribute remainder to largest section
      const largest = row.sections.reduce((a, b) => a.width > b.width ? a : b);
      largest.width += diff;
    }
  }

  return rows;
}

export function generateStructureImage(song: ExportSongData): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const PADDING = 32;
  const BLOCK_H = 70;
  const BLOCK_GAP = 8;
  const MIN_BLOCK_W = 60;
  const CONTENT_W = 736; // 800 - 2*32
  const canvasW = CONTENT_W + PADDING * 2;
  const headerH = 100;
  const footerH = 40;

  const hasBeatData = song.beatTimestamps.length > 0;
  const layoutRows = computeLayout(
    song.sections,
    song.beatTimestamps,
    song.timeSignature,
    CONTENT_W,
    BLOCK_GAP,
    MIN_BLOCK_W
  );

  const blocksH = layoutRows.length * BLOCK_H + (layoutRows.length - 1) * BLOCK_GAP;
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

  for (let rowIdx = 0; rowIdx < layoutRows.length; rowIdx++) {
    const row = layoutRows[rowIdx];
    let x = PADDING;
    const y = blocksStartY + rowIdx * (BLOCK_H + BLOCK_GAP);

    for (const item of row.sections) {
      const w = item.width;
      const color = SECTION_COLORS[item.idx % SECTION_COLORS.length];
      const bars = getBarCount(item.section, song.beatTimestamps, song.timeSignature);
      const barCount = bars !== null ? Math.max(bars, 1) : null;

      // Block background
      ctx.fillStyle = "#262626";
      ctx.beginPath();
      ctx.roundRect(x, y, w, BLOCK_H, 6);
      ctx.fill();

      // Bar lines inside section
      if (hasBeatData && barCount !== null && barCount > 1) {
        const accentW = 4;
        const innerX = x + accentW;
        const innerW = w - accentW;
        for (let b = 1; b < barCount; b++) {
          const lineX = innerX + (b / barCount) * innerW;
          // Every 4th bar line slightly brighter for dense sections
          const bright = barCount > 16 && b % 4 === 0;
          ctx.strokeStyle = bright ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(lineX) + 0.5, y + 2);
          ctx.lineTo(Math.round(lineX) + 0.5, y + BLOCK_H - 2);
          ctx.stroke();
        }
      }

      // Left color accent
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, 4, BLOCK_H, [6, 0, 0, 6]);
      ctx.fill();

      // Section name (truncated to fit)
      ctx.fillStyle = "#f5f5f5";
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      const maxChars = Math.max(3, Math.floor((w - 16) / 7.5));
      const displayName = item.section.name.length > maxChars
        ? item.section.name.slice(0, maxChars - 1) + "…"
        : item.section.name;
      ctx.fillText(displayName, x + 12, y + 22);

      // Bar count
      if (barCount !== null && w >= 70) {
        ctx.fillStyle = "#ccc";
        ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`~${barCount} ${barCount === 1 ? "bar" : "bars"}`, x + 12, y + 40);
      }

      // Time range (only if wide enough)
      if (w >= 120) {
        ctx.fillStyle = "#555";
        ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(
          `${formatTime(item.section.startSec)}–${formatTime(item.section.endSec)}`,
          x + w - 8,
          y + BLOCK_H - 10
        );
        ctx.textAlign = "left";
      }

      x += w + BLOCK_GAP;
    }
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
