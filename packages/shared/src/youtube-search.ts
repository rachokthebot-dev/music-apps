import { execFile } from "child_process";

export type Lane = "lesson" | "track";

export interface Candidate {
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSec: number | null;
  /** Only fetched for the lesson lane, and only for the few worth checking. */
  chapterCount?: number;
  hasSolo?: boolean;
  /** Longer than the importing app allows — shown, but not importable. */
  tooLong?: boolean;
  score: number;
  reasons: string[];
}

/** Flat search returns these; chapters need a second, slower call per video. */
interface FlatEntry {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
}

function run(args: string[], timeoutMs = 45000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("yt-dlp", args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error(`yt-dlp failed: ${error.message}`));
      else resolve(stdout);
    });
  });
}

/**
 * One cheap call (~1.2 s) for N results with title, channel and duration.
 * Deliberately does not fetch chapters — that costs ~1.7 s *per video*, so it
 * is spent only on the handful of candidates that survive ranking.
 */
async function flatSearch(query: string, n: number): Promise<FlatEntry[]> {
  const out = await run([
    "--flat-playlist",
    "--no-warnings",
    "-J",
    `ytsearch${n}:${query}`,
  ]);
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/** Creator-authored chapters. The only structure source we use now. */
export async function fetchChapterInfo(
  videoId: string
): Promise<{ chapterCount: number; hasSolo: boolean }> {
  try {
    const out = await run(
      ["--no-warnings", "--no-playlist", "--print", "%(chapters)j", `https://youtu.be/${videoId}`],
      30000
    );
    const raw = out.trim();
    if (!raw || raw === "NA") return { chapterCount: 0, hasSolo: false };
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return { chapterCount: 0, hasSolo: false };
    return {
      chapterCount: arr.length,
      hasSolo: arr.some((c: { title?: string }) => /solo|lead/i.test(String(c?.title ?? ""))),
    };
  } catch {
    return { chapterCount: 0, hasSolo: false };
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Titles that are the wrong *kind* of video for each lane. Rejecting beats
// down-ranking here: a lyrics re-upload is never the right stem source.
const TRACK_REJECT = /\b(lyrics?|lyric video|live|cover|lesson|tutorial|tab|reaction|karaoke|8d|slowed|nightcore|sped up|remix|loop|hour)\b/i;
const LESSON_REJECT = /\b(reaction|review|top \d+|podcast|interview|unboxing)\b/i;

// Every chaptered source in the existing LickBank library carries this title
// shape. It orders which candidates are worth a chapter fetch — it never
// decides the winner, since the actual chapter check is cheap enough to trust.
const CHAPTER_PRIOR = /guitar tab\s*(\(remake\))?\s*\|\s*lesson/i;

/** Search-only cleanup; the stored title keeps whatever Apple gave us. */
function forQuery(title: string): string {
  return title.replace(/\s*[[(]\s*(?:feat|ft|with)\b[^\])]*[\])]/gi, "").trim();
}

type Script = "latin" | "cyrillic" | "hebrew" | "other";

function scriptOf(s: string): Script {
  if (/\p{Script=Cyrillic}/u.test(s)) return "cyrillic";
  if (/\p{Script=Hebrew}/u.test(s)) return "hebrew";
  if (/\p{Script=Latin}/u.test(s)) return "latin";
  return "other";
}

// Searching in the song's own language finds far more. Measured on
// "Кони беспредела": English terms 3/5 relevant, Russian terms 5/5.
const LESSON_TERMS: Record<Script, string> = {
  cyrillic: "разбор на гитаре",
  hebrew: "שיעור גיטרה",
  latin: "guitar tab lesson",
  other: "guitar tab lesson",
};

export function buildQuery(title: string, artist: string, lane: Lane): string {
  const t = forQuery(title);
  const titleScript = scriptOf(t);

  // Apple romanises artists for non-Latin acts ("Akvarium"), but YouTube uses
  // the native spelling — including the romanised name finds the wrong songs.
  // Measured: "Akvarium <title>" 0/5 relevant, title alone 3/5.
  const artistUsable =
    Boolean(artist) && (titleScript === "latin" || scriptOf(artist) === titleScript);

  const base = artistUsable ? `${artist} ${t}` : t;
  return lane === "lesson" ? `${base} ${LESSON_TERMS[titleScript]}` : base;
}

function scoreCandidate(
  e: FlatEntry,
  lane: Lane,
  title: string,
  artist: string,
  expectedSec: number | null
): { score: number; reasons: string[] } | null {
  const vTitle = String(e.title ?? "");
  const channel = String(e.channel ?? e.uploader ?? "");
  const dur = typeof e.duration === "number" ? e.duration : null;
  const reasons: string[] = [];
  let score = 0;

  if (lane === "track" && TRACK_REJECT.test(vTitle)) return null;
  if (lane === "lesson" && LESSON_REJECT.test(vTitle)) return null;

  // The song title should actually appear — guards against YouTube drifting to
  // "songs like X" or a channel's unrelated upload. Compare against the same
  // cleaned title the query used, or a featuring credit sinks every candidate.
  const nt = norm(forQuery(title));
  if (nt && norm(vTitle).includes(nt)) {
    score += 3;
    reasons.push("title matched");
  } else {
    score -= 4;
    reasons.push("title not matched");
  }

  if (lane === "track") {
    // Channel name matching the artist means the official upload — the
    // cleanest master, which is what Demucs wants.
    if (artist && norm(channel) === norm(artist)) {
      score += 5;
      reasons.push("official artist channel");
    }
    // "Official Audio" is the cleanest stem source; an official *video* is
    // often a shorter edit, so it earns less.
    if (/official\s+audio/i.test(vTitle)) {
      score += 3;
      reasons.push("official audio");
    } else if (/official\s+(music\s+)?video/i.test(vTitle)) {
      score += 1;
      reasons.push("official video (may be an edit)");
    }
    if (/- topic$/i.test(channel)) {
      score += 4;
      reasons.push("Topic channel (auto-generated master)");
    }
  } else {
    // Song titles collide across bands — "Evil Woman" is both ELO and Black
    // Sabbath, and matching on title alone picked the wrong lesson. Reward the
    // artist appearing in the video's title or channel.
    const na = norm(artist);
    if (na) {
      const haystack = `${norm(vTitle)} ${norm(channel)}`;
      // Also try the last word alone, so "The Doobie Brothers" still matches a
      // title that just says "Doobie Brothers".
      const lastWord = na.split(" ").filter((w) => w.length > 3).pop();
      if (haystack.includes(na)) {
        score += 4;
        reasons.push("artist matched");
      } else if (lastWord && haystack.includes(lastWord)) {
        score += 2;
        reasons.push("artist partly matched");
      }
    }
    if (CHAPTER_PRIOR.test(vTitle)) {
      score += 3;
      reasons.push("title pattern that usually has chapters");
    }
    if (/\btabs?\b/i.test(vTitle)) {
      score += 1;
      reasons.push("mentions tabs");
    }
  }

  scoreDuration(dur, expectedSec, reasons, (d) => (score += d));
  if (dur !== null && dur > 3600) return null;

  return { score, reasons };
}

/** Shared by both scorers so a 10-second clip loses the same way everywhere. */
function scoreDuration(
  dur: number | null,
  expectedSec: number | null,
  reasons: string[],
  add: (delta: number) => void
): void {
  if (dur === null) return;
  if (dur < 45) {
    add(-5);
    reasons.push("too short");
    return;
  }
  if (dur > 3600) return; // callers reject these outright
  if (!expectedSec) return;
  // Graded, not a single window: the album cut and a shortened video edit both
  // land inside a loose window, and for stems the full-length one is right.
  const off = Math.abs(dur - expectedSec) / expectedSec;
  if (off <= 0.03) {
    add(4);
    reasons.push("length matches the album cut");
  } else if (off <= 0.1) {
    add(2);
    reasons.push("length close");
  } else if (off <= 0.25) {
    add(1);
    reasons.push("length roughly right");
  } else if (off >= 0.6) {
    add(-3);
    reasons.push("length far off");
  }
}

export interface SearchOptions {
  title: string;
  artist: string;
  lane: Lane;
  /** Known track length, used as a duration sanity check. */
  expectedSec?: number | null;
  /** How many flat results to pull before ranking. */
  poolSize?: number;
  /** How many survivors get a chapter fetch (lesson lane only). */
  chapterChecks?: number;
}

// Results are cached per query for the session. Losing this on a reload is
// harmless — the worst case is re-running a 1.2 s search.
const cache = new Map<string, { at: number; results: Candidate[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function toCandidate(e: FlatEntry, s: { score: number; reasons: string[] }): Candidate {
  return {
    id: String(e.id),
    url: `https://youtu.be/${e.id}`,
    title: String(e.title ?? ""),
    channel: String(e.channel ?? e.uploader ?? ""),
    durationSec: typeof e.duration === "number" ? e.duration : null,
    score: s.score,
    reasons: s.reasons,
  };
}

/**
 * Lesson candidates are only useful if the creator chaptered them, so spend
 * the per-video fetches on the best few — in parallel — and re-sort.
 */
async function applyChapters(ranked: Candidate[], chapterChecks: number): Promise<void> {
  if (ranked.length === 0) return;
  const checkable = ranked.slice(0, chapterChecks);
  const infos = await Promise.all(checkable.map((c) => fetchChapterInfo(c.id)));
  checkable.forEach((c, i) => {
    c.chapterCount = infos[i].chapterCount;
    c.hasSolo = infos[i].hasSolo;
    if (c.chapterCount > 0) {
      c.score += 10;
      c.reasons.push(`${c.chapterCount} chapters`);
    }
    if (c.hasSolo) {
      c.score += 4;
      c.reasons.push("has a Solo chapter");
    }
  });
  ranked.sort((a, b) => b.score - a.score);
}

export async function searchCandidates(opts: SearchOptions): Promise<Candidate[]> {
  const {
    title,
    artist,
    lane,
    expectedSec = null,
    poolSize = 8,
    chapterChecks = 3,
  } = opts;

  const query = buildQuery(title, artist, lane);
  const key = `${lane}|${query}|${expectedSec ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  const entries = await flatSearch(query, poolSize);

  const ranked: Candidate[] = [];
  for (const e of entries) {
    if (!e.id) continue;
    const s = scoreCandidate(e, lane, title, artist, expectedSec);
    if (!s) continue;
    ranked.push(toCandidate(e, s));
  }
  ranked.sort((a, b) => b.score - a.score);

  if (lane === "lesson") await applyChapters(ranked, chapterChecks);

  cache.set(key, { at: Date.now(), results: ranked });
  return ranked;
}

// ---------------------------------------------------------------------------
// Free-text mode: the user types the search themselves, so there is no title /
// artist split to score against — only how well a result covers what they
// asked for, plus the same lane-shape rules.
// ---------------------------------------------------------------------------

/** Words that carry no signal about which video is right. */
const NOISE = /^(the|and|for|with|from|feat|ft|official|guitar|song|video)$/;

function queryTokens(query: string): string[] {
  return norm(query)
    .split(" ")
    .filter((t) => t.length > 2 && !NOISE.test(t));
}

/**
 * Reject rules exist to filter out the wrong *kind* of video — but when the
 * user typed "live" or "cover" themselves, that kind is exactly what they
 * want, so the rule stops applying.
 */
function rejectedKind(vTitle: string, lane: Lane, normalizedQuery: string): boolean {
  const m = vTitle.match(lane === "track" ? TRACK_REJECT : LESSON_REJECT);
  return Boolean(m) && !normalizedQuery.includes(norm(m![0]));
}

function scoreFreeText(
  e: FlatEntry,
  lane: Lane,
  query: string,
  tokens: string[]
): { score: number; reasons: string[] } | null {
  const vTitle = String(e.title ?? "");
  const channel = String(e.channel ?? e.uploader ?? "");
  const dur = typeof e.duration === "number" ? e.duration : null;
  if (dur !== null && dur > 3600) return null;

  const reasons: string[] = [];
  let score = 0;

  if (rejectedKind(vTitle, lane, norm(query))) return null;

  // How much of what you asked for actually shows up in the result.
  const haystack = `${norm(vTitle)} ${norm(channel)}`;
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  const coverage = tokens.length > 0 ? hits / tokens.length : 1;
  if (coverage === 1) {
    score += 4;
    reasons.push("matches your search");
  } else if (coverage >= 0.6) {
    score += 2;
    reasons.push("mostly matches your search");
  } else if (coverage < 0.34) {
    score -= 4;
    reasons.push("weak match");
  }

  if (lane === "track") {
    if (/official\s+audio/i.test(vTitle)) {
      score += 3;
      reasons.push("official audio");
    } else if (/official\s+(music\s+)?video/i.test(vTitle)) {
      score += 1;
      reasons.push("official video (may be an edit)");
    }
    if (/- topic$/i.test(channel)) {
      score += 4;
      reasons.push("Topic channel (auto-generated master)");
    }
  } else {
    if (CHAPTER_PRIOR.test(vTitle)) {
      score += 3;
      reasons.push("title pattern that usually has chapters");
    }
    if (/\btabs?\b/i.test(vTitle)) {
      score += 1;
      reasons.push("mentions tabs");
    }
  }

  scoreDuration(dur, null, reasons, (d) => (score += d));
  return { score, reasons };
}

/** Lesson terms are only appended when the user did not ask for a lesson. */
const ASKED_FOR_LESSON = /lesson|tutorial|\btabs?\b|разбор|урок|שיעור/i;

export function buildFreeTextQuery(query: string, lane: Lane): string {
  const q = query.trim();
  if (lane !== "lesson" || ASKED_FOR_LESSON.test(q)) return q;
  return `${q} ${LESSON_TERMS[scriptOf(q)]}`;
}

export interface FreeTextSearchOptions {
  /** What the user typed. */
  query: string;
  lane: Lane;
  /** Longer results are flagged tooLong rather than dropped, so the cap is visible. */
  maxDurationSec?: number | null;
  poolSize?: number;
  chapterChecks?: number;
}

export async function searchByQuery(opts: FreeTextSearchOptions): Promise<Candidate[]> {
  const { query, lane, maxDurationSec = null, poolSize = 8, chapterChecks = 3 } = opts;

  const searchQuery = buildFreeTextQuery(query, lane);
  if (!searchQuery) return [];

  const key = `q|${lane}|${searchQuery}|${maxDurationSec ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  const entries = await flatSearch(searchQuery, poolSize);
  const tokens = queryTokens(query);

  const ranked: Candidate[] = [];
  for (const e of entries) {
    if (!e.id) continue;
    const s = scoreFreeText(e, lane, query, tokens);
    if (!s) continue;
    const c = toCandidate(e, s);
    if (maxDurationSec && c.durationSec !== null && c.durationSec > maxDurationSec) {
      c.tooLong = true;
      // Kept for honesty about why a likely-looking result is missing, but it
      // can never be imported, so it never outranks something that can.
      c.score -= 100;
    }
    ranked.push(c);
  }
  ranked.sort((a, b) => b.score - a.score);

  // Only the importable ones are worth a chapter fetch.
  if (lane === "lesson") await applyChapters(ranked.filter((c) => !c.tooLong), chapterChecks);
  ranked.sort((a, b) => b.score - a.score);

  cache.set(key, { at: Date.now(), results: ranked });
  return ranked;
}
