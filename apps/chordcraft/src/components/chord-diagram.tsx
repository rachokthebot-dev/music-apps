"use client";

import { getVoicings, type ChordVoicing } from "@/lib/chord-voicings";

interface ChordDiagramProps {
  chordName: string;
  voicingIndex?: number; // which voicing to display (default 0)
  compact?: boolean;     // smaller version for inline display
}

export function ChordDiagram({ chordName, voicingIndex = 0, compact = false }: ChordDiagramProps) {
  const voicings = getVoicings(chordName);
  if (voicings.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground py-2">
        No diagram
      </div>
    );
  }

  const voicing = voicings[Math.min(voicingIndex, voicings.length - 1)];
  return <FretboardSVG voicing={voicing} compact={compact} />;
}

interface FretboardSVGProps {
  voicing: ChordVoicing;
  compact?: boolean;
}

function FretboardSVG({ voicing, compact = false }: FretboardSVGProps) {
  const { frets, barres = [], baseFret } = voicing;

  // Dimensions
  const numStrings = 6;
  const numFrets = 5;
  const stringSpacing = compact ? 14 : 18;
  const fretSpacing = compact ? 18 : 22;
  const topPadding = compact ? 24 : 30; // space for open/mute markers
  const bottomPadding = compact ? 4 : 6;
  const leftPadding = baseFret > 1 ? (compact ? 20 : 24) : (compact ? 8 : 10);
  const rightPadding = compact ? 8 : 10;

  const fretboardWidth = (numStrings - 1) * stringSpacing;
  const fretboardHeight = numFrets * fretSpacing;

  const svgWidth = fretboardWidth + leftPadding + rightPadding;
  const svgHeight = fretboardHeight + topPadding + bottomPadding;

  const dotRadius = compact ? 4.5 : 5.5;
  const markerSize = compact ? 5 : 6;

  // X position for a string (0 = low E, 5 = high E)
  const stringX = (s: number) => leftPadding + s * stringSpacing;
  // Y position for a fret (0 = nut, 1 = first fret line, etc.)
  const fretY = (f: number) => topPadding + f * fretSpacing;

  // The "nut" is thick only when baseFret === 1
  const isOpenPosition = baseFret === 1;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-auto max-w-[120px] md:max-w-[150px] lg:max-w-[160px]"
      role="img"
      aria-label={`${voicing.name} chord diagram`}
    >
      {/* Nut or position indicator */}
      {isOpenPosition ? (
        <rect
          x={stringX(0) - 1}
          y={fretY(0) - 2}
          width={fretboardWidth + 2}
          height={3}
          rx={1}
          fill="oklch(0.85 0 0)"
        />
      ) : (
        <text
          x={leftPadding - (compact ? 14 : 16)}
          y={fretY(0) + fretSpacing / 2 + (compact ? 3 : 4)}
          fontSize={compact ? 9 : 11}
          fill="oklch(0.65 0 0)"
          textAnchor="middle"
          fontWeight="600"
        >
          {baseFret}
        </text>
      )}

      {/* Fret lines */}
      {Array.from({ length: numFrets + 1 }).map((_, i) => (
        <line
          key={`fret-${i}`}
          x1={stringX(0)}
          y1={fretY(i)}
          x2={stringX(numStrings - 1)}
          y2={fretY(i)}
          stroke="oklch(0.4 0 0)"
          strokeWidth={i === 0 && !isOpenPosition ? 1.5 : 1}
        />
      ))}

      {/* String lines */}
      {Array.from({ length: numStrings }).map((_, i) => (
        <line
          key={`string-${i}`}
          x1={stringX(i)}
          y1={fretY(0)}
          x2={stringX(i)}
          y2={fretY(numFrets)}
          stroke="oklch(0.5 0 0)"
          strokeWidth={1 + (numStrings - 1 - i) * 0.15}
        />
      ))}

      {/* Barre bars */}
      {barres.map((barreFret) => {
        // Find the range of strings this barre covers
        const barreStrings = frets
          .map((f, i) => ({ fret: f, string: i }))
          .filter((s) => s.fret === barreFret || (s.fret >= barreFret && barres.includes(barreFret)));

        // Find leftmost and rightmost strings that are part of the barre
        const stringsAtFret = frets
          .map((f, i) => ({ fret: f, string: i }))
          .filter((s) => s.fret === barreFret);

        if (stringsAtFret.length < 2) return null;

        const minString = Math.min(...stringsAtFret.map((s) => s.string));
        const maxString = Math.max(...stringsAtFret.map((s) => s.string));

        return (
          <rect
            key={`barre-${barreFret}`}
            x={stringX(minString) - dotRadius}
            y={fretY(barreFret) - fretSpacing / 2 - dotRadius}
            width={stringX(maxString) - stringX(minString) + dotRadius * 2}
            height={dotRadius * 2}
            rx={dotRadius}
            fill="oklch(0.88 0 0)"
          />
        );
      })}

      {/* Finger positions, open strings, muted strings */}
      {frets.map((fret, stringIdx) => {
        const x = stringX(stringIdx);

        if (fret === -1) {
          // Muted string: X marker
          const y = topPadding - (compact ? 10 : 12);
          return (
            <g key={`marker-${stringIdx}`}>
              <line
                x1={x - markerSize / 2}
                y1={y - markerSize / 2}
                x2={x + markerSize / 2}
                y2={y + markerSize / 2}
                stroke="oklch(0.55 0 0)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <line
                x1={x + markerSize / 2}
                y1={y - markerSize / 2}
                x2={x - markerSize / 2}
                y2={y + markerSize / 2}
                stroke="oklch(0.55 0 0)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </g>
          );
        }

        if (fret === 0) {
          // Open string: O marker
          const y = topPadding - (compact ? 10 : 12);
          return (
            <circle
              key={`marker-${stringIdx}`}
              cx={x}
              cy={y}
              r={markerSize / 2}
              fill="none"
              stroke="oklch(0.65 0 0)"
              strokeWidth={1.5}
            />
          );
        }

        // Fretted position: filled circle
        // Check if this string is part of a barre (skip individual dot if barre covers it)
        const isBarreNote = barres.includes(fret) && frets.filter((f) => f === fret).length > 1;
        const y = fretY(fret) - fretSpacing / 2;

        return (
          <circle
            key={`dot-${stringIdx}`}
            cx={x}
            cy={y}
            r={dotRadius}
            fill={isBarreNote ? "oklch(0.88 0 0)" : "oklch(0.88 0 0)"}
          />
        );
      })}
    </svg>
  );
}

// Export for the position explorer
export { FretboardSVG };
