"use client";

/**
 * Ship a recorded take to the archive, and keep its window up to date.
 *
 * The tab holds the only copy of a capture and drops it when you close the
 * preset, so a take that measured oddly can never be looked at again. This
 * sends it to /api/takes on the way past — audio, the proposed window, and
 * whatever you drag it to — so the window can be tuned against real takes
 * instead of remembered ones.
 *
 * Nothing here is allowed to disturb recording: every failure is swallowed. A
 * missed archive costs a debug sample, while an error where the reading should
 * be costs the take.
 */

import { encodeWavFloat32 } from "./wavEncode";
import type { TakeMeta, TakeRegion, TakeReading } from "./takeStore";

/** How long a drag has to settle before the correction is written. */
const SETTLE_MS = 600;

export interface ArchivedTake {
  /**
   * Record the window now in force. Debounced — a drag fires this per pointer
   * move. measureSec goes with it where it can be changed after the fact: a
   * re-proposed window under a new cap would otherwise be stored against the
   * cap that didn't produce it, and no replay could reproduce it.
   */
  update(region: TakeRegion, reading: TakeReading, measureSec?: number): void;
}

export function archiveTake(
  meta: Omit<TakeMeta, "id" | "recordedAt">,
  channels: Float32Array[],
  sampleRate: number
): ArchivedTake {
  const form = new FormData();
  form.append("file", encodeWavFloat32(channels, sampleRate), "take.wav");
  form.append("meta", JSON.stringify(meta));

  const id = fetch("/soundpath/api/takes", { method: "POST", body: form })
    .then((r) => r.json())
    .then((d: { ok?: boolean; id?: string }) => (d.ok ? (d.id ?? null) : null))
    .catch(() => null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    update(region, reading, measureSec) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        // Wait for the upload rather than racing it: the first correction often
        // lands while a couple of megabytes are still going up the wire.
        const takeId = await id;
        if (!takeId) return;
        fetch("/soundpath/api/takes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: takeId, ...region, ...reading, measureSec }),
        }).catch(() => {});
      }, SETTLE_MS);
    },
  };
}
