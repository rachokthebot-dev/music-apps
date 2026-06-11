/**
 * Helix block icons + category colors.
 *
 * Ported from HelAIx's IconLibrary.jsx (MIT). Each icon is a small custom SVG
 * sized to fit inside a flow-node block card. The category mapping uses the
 * Helix model id (HD2_…) which we already resolve via friendlyCategory.
 *
 * Reference: https://github.com/MrCitron/helaix/blob/main/app/frontend/src/components/IconLibrary.jsx
 */

import type { FC, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseSvgProps: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
};

const Amp: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <rect x="5" y="8" width="14" height="10" rx="1.5" />
    <path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <circle cx="9" cy="13" r="1.2" fill="currentColor" />
    <circle cx="15" cy="13" r="1.2" fill="currentColor" />
  </svg>
);

const Cab: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  </svg>
);

const Drive: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 12h3l3-6 6 12 3-6h3" />
  </svg>
);

const Comp: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M13 3L6 13h5l-2 8 7-10h-5l2-8z" />
  </svg>
);

const Delay: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" opacity="0.6" />
  </svg>
);

const Reverb: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </svg>
);

const Mod: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} strokeWidth={2.4} strokeLinecap="round" {...props}>
    <path d="M3 12c0-4 3-7 7-7s4 3 6 7 2 7 6 7 3-3 5-7" />
  </svg>
);

const EQ: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} strokeLinecap="round" {...props}>
    <path d="M3 12h18" opacity="0.3" />
    <path d="M7 8v8M12 4v16M17 8v8" />
  </svg>
);

const Wah: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <rect x="7" y="4" width="10" height="16" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h6" opacity="0.8" />
  </svg>
);

const Volume: FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <rect x="4" y="14" width="3" height="5" rx="0.5" />
    <rect x="9" y="11" width="3" height="8" rx="0.5" />
    <rect x="14" y="8" width="3" height="11" rx="0.5" />
    <rect x="19" y="5" width="3" height="14" rx="0.5" />
  </svg>
);

const Filter: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} strokeLinecap="round" {...props}>
    <path d="M3 17l4-5 4 2 4-8 6 7" />
  </svg>
);

const Pitch: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 4h6v6L17 8l3 3-3 3 2-2v6H9v-6l-2 2-3-3 3-3-2 2V4z" />
  </svg>
);

const Gate: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <rect x="4" y="6" width="16" height="12" rx="1" />
    <path d="M9 9v6M15 9v6" strokeLinecap="round" />
  </svg>
);

const FX: FC<IconProps> = (props) => (
  <svg {...baseSvgProps} {...props}>
    <circle cx="12" cy="12" r="9" strokeDasharray="2 2" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

/** Category → icon component. The category strings match friendlyCategory(). */
const ICON_BY_CATEGORY: Record<string, FC<IconProps>> = {
  Amp,
  Cab,
  Drive,
  Comp,
  Delay,
  Reverb,
  Mod,
  EQ,
  Wah,
  Volume,
  Filter,
  Pitch,
  Gate,
};

/** Category → hex color (matches HX Edit's signal-chain coloring). */
const COLOR_BY_CATEGORY: Record<string, string> = {
  Amp: "#FF5252",       // red — amps + cab head
  Cab: "#D32F2F",       // darker red — paired with Amp
  Drive: "#FF7043",     // orange — distortion
  Comp: "#FFC107",      // amber — dynamics
  Gate: "#FFB300",      // amber — gate variant
  EQ: "#FFEB3B",        // yellow — EQ
  Mod: "#42A5F5",       // blue — modulation
  Delay: "#66BB6A",     // green — delay
  Reverb: "#FF9800",    // orange — reverb (matches HX Edit)
  Volume: "#26C6DA",    // cyan — volume/pan
  Wah: "#AB47BC",       // purple — wah
  Filter: "#5C6BC0",    // indigo — filter
  Pitch: "#EC407A",     // pink — pitch/synth
};

const DEFAULT_COLOR = "#607D8B"; // gray blue

export function iconForCategory(category: string | null): FC<IconProps> {
  if (!category) return FX;
  return ICON_BY_CATEGORY[category] ?? FX;
}

export function colorForCategory(category: string | null): string {
  if (!category) return DEFAULT_COLOR;
  return COLOR_BY_CATEGORY[category] ?? DEFAULT_COLOR;
}
