import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchApplePlaylist, isApplePlaylistUrl } from "./apple-music";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function servePage(html: string, ok = true, status = 200): void {
  globalThis.fetch = (async () => ({ ok, status, text: async () => html })) as typeof fetch;
}

/** An Apple-curated playlist: schema.org block, ISO 8601 durations. */
function ldJsonPage(tracks: Array<{ name: string; artist?: string; duration?: string }>): string {
  return `<html><head>
    <meta property="og:title" content="Guitar Anthems by Apple Music on Apple Music"/>
    <script type="application/ld+json">${JSON.stringify({
      name: "Guitar Anthems",
      track: tracks.map((t) => ({
        "@type": "MusicRecording",
        name: t.name,
        byArtist: t.artist ? { name: t.artist } : undefined,
        duration: t.duration,
      })),
    })}</script></head><body></body></html>`;
}

/** A user playlist: server-data block, millisecond durations. */
function serverDataPage(
  name: string,
  rows: Array<{ title: string; artist: string; duration?: number }>
): string {
  const payload = {
    sections: [
      {
        items: rows.map((r) => ({
          title: r.title,
          duration: r.duration,
          subtitleLinks: [{ title: r.artist }],
        })),
      },
    ],
  };
  return `<html><head>
    <meta property="og:title" content="${name} by Someone on Apple Music"/>
    <script type="application/json" id="serialized-server-data">${JSON.stringify(payload)}</script>
    </head><body></body></html>`;
}

// ---------------------------------------------------------------------------
// URL recognition
// ---------------------------------------------------------------------------

test("isApplePlaylistUrl accepts a playlist link in any storefront", () => {
  assert.equal(isApplePlaylistUrl("https://music.apple.com/us/playlist/x/pl.abc"), true);
  assert.equal(isApplePlaylistUrl("https://music.apple.com/gb/playlist/x/pl.abc"), true);
  assert.equal(isApplePlaylistUrl("  https://music.apple.com/de/playlist/x/pl.abc  "), true);
});

test("isApplePlaylistUrl rejects albums, artists and other services", () => {
  assert.equal(isApplePlaylistUrl("https://music.apple.com/us/album/x/123"), false);
  assert.equal(isApplePlaylistUrl("https://open.spotify.com/playlist/abc"), false);
  assert.equal(isApplePlaylistUrl("not a url"), false);
});

// ---------------------------------------------------------------------------
// ld+json branch — Apple-curated playlists
// ---------------------------------------------------------------------------

test("parses an ld+json playlist and converts ISO 8601 durations", async () => {
  servePage(
    ldJsonPage([
      { name: "Cliffs of Dover", artist: "Eric Johnson", duration: "PT4M28S" },
      { name: "Black Dog", artist: "Led Zeppelin", duration: "PT4M56S" },
    ])
  );
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");

  assert.equal(pl.name, "Guitar Anthems", "the Apple title suffix comes off");
  assert.deepEqual(pl.tracks, [
    { title: "Cliffs of Dover", artist: "Eric Johnson", durationSec: 268 },
    { title: "Black Dog", artist: "Led Zeppelin", durationSec: 296 },
  ]);
});

test("parses an hours-long ISO duration", async () => {
  servePage(ldJsonPage([{ name: "Live Set", artist: "A Band", duration: "PT1H2M3S" }]));
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.equal(pl.tracks[0].durationSec, 3723);
});

test("a missing or malformed duration becomes null, not a wrong number", async () => {
  servePage(
    ldJsonPage([
      { name: "No Length", artist: "A Band" },
      { name: "Junk Length", artist: "A Band", duration: "4:28" },
      { name: "Zero Length", artist: "A Band", duration: "PT0S" },
    ])
  );
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.deepEqual(pl.tracks.map((t) => t.durationSec), [null, null, null]);
});

// ---------------------------------------------------------------------------
// serialized-server-data branch — user playlists
// ---------------------------------------------------------------------------

test("parses a user playlist and converts millisecond durations", async () => {
  servePage(
    serverDataPage("Road Trip", [
      { title: "Sultans of Swing", artist: "Dire Straits", duration: 348000 },
      { title: "Evil Woman", artist: "Electric Light Orchestra", duration: 255400 },
    ])
  );
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");

  assert.equal(pl.name, "Road Trip");
  assert.deepEqual(pl.tracks, [
    { title: "Sultans of Swing", artist: "Dire Straits", durationSec: 348 },
    { title: "Evil Woman", artist: "Electric Light Orchestra", durationSec: 255 },
  ]);
});

test("server-data wins over ld+json, because only it carries the artist", async () => {
  // Apple-curated pages ship both, and the ld+json block leaves byArtist null.
  // Picking the wrong one sends the YouTube search off without an artist.
  const both = ldJsonPage([{ name: "Black Dog", duration: "PT4M56S" }]).replace(
    "</head>",
    `<script type="application/json" id="serialized-server-data">${JSON.stringify({
      items: [{ title: "Black Dog", duration: 296000, subtitleLinks: [{ title: "Led Zeppelin" }] }],
    })}</script></head>`
  );
  servePage(both);
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.equal(pl.tracks[0].artist, "Led Zeppelin", "must not fall back to the artist-less block");
});

test("the playlist's own header row is not imported as a song", async () => {
  servePage(
    serverDataPage("Road Trip", [
      { title: "Road Trip", artist: "Some Curator" },
      { title: "Black Dog", artist: "Led Zeppelin", duration: 296000 },
    ])
  );
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.deepEqual(pl.tracks.map((t) => t.title), ["Black Dog"]);
});

test("a track repeated in the playlist is imported once", async () => {
  servePage(
    serverDataPage("Road Trip", [
      { title: "Black Dog", artist: "Led Zeppelin", duration: 296000 },
      { title: "Black Dog", artist: "Led Zeppelin", duration: 296000 },
    ])
  );
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.equal(pl.tracks.length, 1);
});

// ---------------------------------------------------------------------------
// Title cleanup — these suffixes hurt a YouTube search more than they help
// ---------------------------------------------------------------------------

test("strips remaster, deluxe and edit suffixes from titles", async () => {
  servePage(
    serverDataPage("Road Trip", [
      { title: "Black Dog (2012 Remaster)", artist: "Led Zeppelin" },
      { title: "Layla [Deluxe Edition]", artist: "Derek and the Dominos" },
      { title: "Sultans of Swing - 1996 Remastered", artist: "Dire Straits" },
      { title: "Roundabout (Extended Version)", artist: "Yes" },
    ])
  );
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.deepEqual(pl.tracks.map((t) => t.title), [
    "Black Dog",
    "Layla",
    "Sultans of Swing",
    "Roundabout",
  ]);
});

test("keeps a featuring credit, which is part of the real title", async () => {
  servePage(serverDataPage("Road Trip", [{ title: "So Good (feat. Kendrick Lamar)", artist: "Jhené Aiko" }]));
  const pl = await fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a");
  assert.equal(pl.tracks[0].title, "So Good (feat. Kendrick Lamar)");
});

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

test("a non-OK response is reported with its status", async () => {
  servePage("", false, 404);
  await assert.rejects(
    () => fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a"),
    /404/
  );
});

test("a page with no readable track list fails loudly rather than silently empty", async () => {
  servePage("<html><head><title>Nothing</title></head><body></body></html>");
  await assert.rejects(
    () => fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a"),
    /Could not read a track list/
  );
});

test("malformed JSON in the server-data block does not crash the parse", async () => {
  const html = `<html><head><meta property="og:title" content="X on Apple Music"/>
    <script type="application/json" id="serialized-server-data">{not json</script>
    </head><body></body></html>`;
  servePage(html);
  await assert.rejects(
    () => fetchApplePlaylist("https://music.apple.com/us/playlist/x/pl.a"),
    /Could not read a track list/
  );
});
