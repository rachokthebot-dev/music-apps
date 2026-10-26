/**
 * Reorder or delete a preset's snapshots, in the payload itself.
 *
 * Unlike a rename this has to touch the .hlx: the slot a snapshot sits in is
 * which footswitch recalls it, and the export ships the payload. So the hash
 * changes — but the tones don't, so each reading moves with its snapshot
 * rather than being dropped the way a genuinely edited patch's would be.
 *
 * The Helix always has its full set of slots. A deleted snapshot's slot is
 * refilled at the end as an unnamed copy of the new first snapshot: unnamed so
 * nothing treats it as a part, and a copy so the distinct-tone fallback for
 * unnamed presets doesn't count it as one either.
 */

import { hashPreset, type LevelPreset } from "./levelDoc";

type Snap = Record<string, unknown>;

/**
 * `order` lists the snapshot indices the preset shows, in their new order.
 * Any it leaves out are deleted. Slots the preset doesn't show (unused ones)
 * keep their relative order after the listed ones.
 */
export function rearrangeSnapshots(
  preset: LevelPreset,
  order: number[]
): { ok: true; preset: LevelPreset } | { ok: false; error: string } {
  const shown = new Set(preset.snapshots.map((s) => s.index));
  if (new Set(order).size !== order.length || order.some((i) => !shown.has(i))) {
    return { ok: false, error: "That order doesn't match this preset's snapshots" };
  }
  if (order.length === 0) return { ok: false, error: "A preset needs at least one snapshot" };

  let parsed: { data?: { tone?: Record<string, unknown> } };
  try {
    parsed = JSON.parse(preset.hlx);
  } catch {
    return { ok: false, error: "Could not read this preset" };
  }
  const tone = parsed.data?.tone;
  if (!tone) return { ok: false, error: "Could not read this preset" };

  const slots: number[] = [];
  for (let i = 0; i < 8; i++) if (tone[`snapshot${i}`]) slots.push(i);

  const deleted = [...shown].filter((i) => !order.includes(i));
  const sequence = [...order, ...slots.filter((i) => !shown.has(i))];
  const old = Object.fromEntries(slots.map((i) => [i, tone[`snapshot${i}`] as Snap]));

  const newIndexOf = new Map<number, number>();
  sequence.forEach((from, to) => {
    tone[`snapshot${to}`] = old[from];
    newIndexOf.set(from, to);
  });
  for (let to = sequence.length; to < slots.length; to++) {
    tone[`snapshot${to}`] = {
      ...structuredClone(old[sequence[0]]),
      "@name": `SNAPSHOT ${to + 1}`,
      "@custom_name": false,
    };
  }

  const global = tone.global as Snap | undefined;
  if (global) {
    const current = Number(global["@current_snapshot"] ?? 0);
    global["@current_snapshot"] = newIndexOf.get(current) ?? 0;
  }

  const hlx = JSON.stringify(parsed);
  return {
    ok: true,
    preset: {
      ...preset,
      hlx,
      hash: hashPreset(hlx),
      snapshots: preset.snapshots
        .filter((s) => !deleted.includes(s.index))
        .map((s) => ({ ...s, index: newIndexOf.get(s.index)! }))
        .sort((a, b) => a.index - b.index),
    },
  };
}
