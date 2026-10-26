import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchSpotifyPlaylist, isSpotifyPlaylistUrl, playlistId } from "./spotify";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function servePage(html: string, ok = true, status = 200): void {
  globalThis.fetch = (async () => ({ ok, status, text: async () => html })) as typeof fetch;
}

/** The embed page: playlist JSON inside a __NEXT_DATA__ block. */
function embedPage(
  name: string,
  rows: Array<{ title: string; subtitle?: string; duration?: number }>
): string {
  const payload = {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              type: "playlist",
              name,
              trackList: rows.map((r) => ({
                title: r.title,
                subtitle: r.subtitle,
                duration: r.duration,
              })),
            },
          },
        },
      },
    },
  };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    payload
  )}</script></body></html>`;
}

test("isSpotifyPlaylistUrl accepts the three link forms", () => {
  assert.equal(isSpotifyPlaylistUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"), true);
  assert.equal(
    isSpotifyPlaylistUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123"),
    true
  );
  assert.equal(isSpotifyPlaylistUrl("https://open.spotify.com/intl-de/playlist/37i9dQZF1DX"), true);
  assert.equal(isSpotifyPlaylistUrl("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"), true);
});

test("isSpotifyPlaylistUrl rejects other Spotify links and other services", () => {
  assert.equal(isSpotifyPlaylistUrl("https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3"), false);
  assert.equal(isSpotifyPlaylistUrl("https://open.spotify.com/track/3XmwAZpIMNpTJy8faw3ajD"), false);
  assert.equal(isSpotifyPlaylistUrl("https://music.apple.com/us/playlist/x/pl.123"), false);
  assert.equal(isSpotifyPlaylistUrl("not a link"), false);
});

test("playlistId ignores the share query and surrounding whitespace", () => {
  assert.equal(
    playlistId("  https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=7a0e  "),
    "37i9dQZF1DXcBWIGoYBM5M"
  );
});

test("fetchSpotifyPlaylist reads the name and the tracks", async () => {
  servePage(
    embedPage("Road Trip", [
      { title: "Hotel California", subtitle: "Eagles", duration: 391000 },
      { title: "Black Hole Sun", subtitle: "Soundgarden", duration: 318000 },
    ])
  );

  const playlist = await fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123");

  assert.equal(playlist.name, "Road Trip");
  assert.deepEqual(playlist.tracks, [
    { title: "Hotel California", artist: "Eagles", durationSec: 391 },
    { title: "Black Hole Sun", artist: "Soundgarden", durationSec: 318 },
  ]);
});

test("fetchSpotifyPlaylist keeps only the first artist", async () => {
  // Spotify joins artists with a non-breaking space after the comma.
  servePage(embedPage("Duets", [{ title: "Smooth", subtitle: "Santana, Rob Thomas" }]));

  const playlist = await fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123");

  assert.equal(playlist.tracks[0].artist, "Santana");
});

test("fetchSpotifyPlaylist strips remaster suffixes from titles", async () => {
  servePage(
    embedPage("Classics", [
      { title: "Come Together - 2019 Mix", subtitle: "The Beatles" },
      { title: "Lola - 2011 Remaster", subtitle: "The Kinks" },
      { title: "Paranoid (2012 Remaster)", subtitle: "Black Sabbath" },
    ])
  );

  const playlist = await fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123");

  assert.deepEqual(
    playlist.tracks.map((t) => t.title),
    ["Come Together - 2019 Mix", "Lola", "Paranoid"]
  );
});

test("fetchSpotifyPlaylist reports a missing duration as null rather than zero", async () => {
  servePage(embedPage("Mixed", [{ title: "Live Jam", subtitle: "Phish", duration: 0 }]));

  const playlist = await fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123");

  assert.equal(playlist.tracks[0].durationSec, null);
});

test("fetchSpotifyPlaylist rejects a link that is not a playlist", async () => {
  await assert.rejects(
    fetchSpotifyPlaylist("https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3"),
    /doesn't look like a Spotify playlist/
  );
});

test("fetchSpotifyPlaylist explains an empty playlist rather than importing nothing", async () => {
  servePage(embedPage("Private Stuff", []));

  await assert.rejects(
    fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123"),
    /empty or not public/
  );
});

test("fetchSpotifyPlaylist surfaces a bad response", async () => {
  servePage("", false, 404);

  await assert.rejects(fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123"), /404/);
});

test("fetchSpotifyPlaylist fails loudly when the page has no data block", async () => {
  servePage("<html><body>Something else entirely</body></html>");

  await assert.rejects(
    fetchSpotifyPlaylist("https://open.spotify.com/playlist/abc123"),
    /Could not read a track list/
  );
});
