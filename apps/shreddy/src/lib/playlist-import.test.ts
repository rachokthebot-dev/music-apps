import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candidate } from "@music-apps/shared/youtube-search";
import { mapWithLimit, findExisting, rankCandidates } from "./playlist-import";

function candidate(over: Partial<Candidate> & { score: number }): Candidate {
  return {
    id: "x",
    url: "https://youtu.be/x",
    title: "t",
    channel: "c",
    durationSec: 200,
    reasons: [],
    ...over,
  };
}

function track(title: string, artist: string) {
  return { title, artist, durationSec: null };
}

// ---------------------------------------------------------------------------
// mapWithLimit — the refill loop is the part worth testing: with more items
// than slots, each worker has to pick up the next unclaimed index.
// ---------------------------------------------------------------------------

test("mapWithLimit preserves input order regardless of completion order", async () => {
  const items = [50, 10, 40, 5, 30, 1, 20];
  const out = await mapWithLimit(items, 3, async (n) => {
    // Later items finish sooner, so completion order is not input order.
    await new Promise((r) => setTimeout(r, n));
    return n * 2;
  });
  assert.deepEqual(out, [100, 20, 80, 10, 60, 2, 40]);
});

test("mapWithLimit never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
  });
  assert.equal(peak, 4, "should saturate but not exceed the limit");
});

test("mapWithLimit handles fewer items than the limit", async () => {
  const out = await mapWithLimit([1, 2], 8, async (n) => n + 1);
  assert.deepEqual(out, [2, 3]);
});

test("mapWithLimit handles an empty list without hanging", async () => {
  assert.deepEqual(await mapWithLimit([], 4, async (n) => n), []);
});

test("mapWithLimit visits every item exactly once", async () => {
  const seen: number[] = [];
  const items = Array.from({ length: 50 }, (_, i) => i);
  await mapWithLimit(items, 4, async (n) => {
    await new Promise((r) => setTimeout(r, n % 3));
    seen.push(n);
  });
  assert.deepEqual([...seen].sort((a, b) => a - b), items);
});

// ---------------------------------------------------------------------------
// rankCandidates — the import cap and the auto-select threshold.
// ---------------------------------------------------------------------------

test("rankCandidates demotes an over-cap winner below a shorter rival", () => {
  const long = candidate({ id: "long", score: 15, durationSec: 900 });
  const ok = candidate({ id: "ok", score: 4, durationSec: 240 });
  const { candidates, confident } = rankCandidates([long, ok], 600);

  assert.equal(candidates[0].id, "ok", "the importable one must win");
  assert.equal(long.tooLong, true);
  assert.equal(long.score, -85, "demoted by 100");
  assert.equal(confident, false, "score 4 is below the bar");
});

test("rankCandidates keeps an over-cap result visible rather than dropping it", () => {
  const { candidates } = rankCandidates(
    [candidate({ id: "long", score: 15, durationSec: 900 })],
    600
  );
  assert.equal(candidates.length, 1, "explained, not hidden");
  assert.equal(candidates[0].tooLong, true);
});

test("rankCandidates never calls an over-cap top pick confident", () => {
  // Even a perfect score can't be auto-selected if it can't be imported.
  const { confident } = rankCandidates(
    [candidate({ score: 20, durationSec: 4000 })],
    600
  );
  assert.equal(confident, false);
});

test("the over-cap guard holds independently of the score demotion", () => {
  // A score high enough to survive -100 still must not be auto-selected. Real
  // scores top out around 20, so the guard and the demotion are each enough on
  // their own — this pins that, so removing either one is caught here.
  const { candidates, confident } = rankCandidates(
    [candidate({ score: 150, durationSec: 4000 })],
    600
  );
  assert.equal(candidates[0].score, 50, "still demoted");
  assert.equal(confident, false, "tooLong alone must block confidence");
});

test("rankCandidates treats exactly-at-cap as importable", () => {
  const { candidates, confident } = rankCandidates(
    [candidate({ score: 10, durationSec: 600 })],
    600
  );
  assert.equal(candidates[0].tooLong, undefined);
  assert.equal(confident, true);
});

test("rankCandidates is confident at the threshold but not below it", () => {
  assert.equal(rankCandidates([candidate({ score: 6 })], 600).confident, true);
  assert.equal(rankCandidates([candidate({ score: 5 })], 600).confident, false);
});

test("rankCandidates handles an empty candidate list", () => {
  const { candidates, confident } = rankCandidates([], 600);
  assert.deepEqual(candidates, []);
  assert.equal(confident, false, "nothing to pick is never confident");
});

test("rankCandidates leaves unknown durations alone", () => {
  const { candidates, confident } = rankCandidates(
    [candidate({ score: 8, durationSec: null })],
    600
  );
  assert.equal(candidates[0].tooLong, undefined);
  assert.equal(confident, true);
});

// ---------------------------------------------------------------------------
// findExisting — the dedupe that decides whether a song is preselected as a
// skip. Loose on title, strict enough on artist that covers don't match.
// ---------------------------------------------------------------------------

const library = [
  { id: "s1", title: "Sultans of Swing (Official Audio)", artist: "Dire Straits" },
  { id: "s2", title: "Black Dog", artist: "Led Zeppelin" },
  { id: "s3", title: "Evil Woman", artist: "Black Sabbath" },
];

test("findExisting matches despite the uploader's extra words", () => {
  assert.equal(findExisting(library, track("Sultans of Swing", "Dire Straits")), "s1");
});

test("findExisting matches when the library title is the shorter one", () => {
  assert.equal(findExisting(library, track("Black Dog", "Led Zeppelin")), "s2");
});

test("findExisting ignores punctuation and case", () => {
  assert.equal(findExisting(library, track("BLACK  DOG!", "led zeppelin")), "s2");
});

test("findExisting does not match the same title by a different band", () => {
  // The exact collision the ranker warns about — ELO's Evil Woman is not
  // Black Sabbath's, and preselecting it as a skip would lose the song.
  assert.equal(findExisting(library, track("Evil Woman", "Electric Light Orchestra")), null);
});

test("findExisting matches on title alone when the track has no artist", () => {
  assert.equal(findExisting(library, track("Black Dog", "")), "s2");
});

test("findExisting returns null for a song not in the library", () => {
  assert.equal(findExisting(library, track("Cliffs of Dover", "Eric Johnson")), null);
});

test("findExisting returns null for an empty title rather than matching everything", () => {
  assert.equal(findExisting(library, track("", "Led Zeppelin")), null);
});
