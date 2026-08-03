# SoundPath

Level Helix presets from real recordings. Play each snapshot once, and SoundPath measures its integrated loudness and writes the correction to the path output block — so a whole gig, or one patch on its own, lands at the same target.

<!-- ![SoundPath](screenshots/soundpath.png) -->

## Why measured, not predicted

An earlier version of this app predicted loudness by summing per-block dB models from the preset JSON. It was badly wrong — a modeller's chain is non-linear and its level depends on spectrum, so a preset can read as aligned and still be 20 dB out in the room. One gig looked level while a song sat 30 dB down.

Nothing here reads a preset to decide how loud it is. Every number comes from a recording, measured with ITU-R BS.1770 integrated loudness (`packages/gain-estimator/src/loudness/`), in the browser, using the same code the server runs on uploads.

## Three views

**Library** — everything stored here. Setlists and presets share one row: name, where it came from, when it was last recorded, how much of it is measured. Open either to work on it.

**Preset** — one patch on its own, against the same target a gig uses. For something from HelAIx, or a song that changed after the gig was recorded: load one `.hlx` on the Helix instead of the whole setlist, record it, and hand the readings back.

**Setlist** — the whole gig. Record each song, confirm a pass, download one `.hls` where nothing jumps between songs.

## What makes partial re-recording safe

Every reading stores the output level it was taken through (`measuredBaselineDb`). A correction moves a snapshot from where it *was* to where it should be, and "where it was" is that number — not whatever happens to be loaded now.

That one field is what lets you change one song, re-record only that song, and leave the other twenty untouched. Declared, never inferred: the app asks what's on the Helix rather than guessing, because a wrong baseline is invisible — the numbers stay entirely plausible and the output is confidently wrong.

It also means a reading is portable. Level a preset on its own and its readings can be taken into a gig, where they're levelled against that gig's target and role offsets. Guarded on a pinned target: a gig that centres on its own recordings would be dragged by an outside reading.

## The measurement window

A take is measured over the *body* of the note — starting 150 ms after the onset, running 600 ms, stopping early only if the note has.

Both edges keep the reading about the patch rather than the performance. The pick attack is the loudest thing in a take and it measures your right hand: swing from fingers to a hard pick and an attack-inclusive window moves 1.7 dB, while this one stays inside 0.03 dB. And songs are strummed — the chord is struck again long before it dies, so the fade is loudness nobody hears. Modelled against passages where each stroke resets the string, six patches from fast-decaying clean to compressed lead sit within about 1 dB of each other, while a 3 s window spreads them over 7 dB.

Clipping is judged over the note *including* its attack, since that's what hits the converter. A clipped take is refused outright: a clipped chord measures quieter than it really is, so the plan would push it further into the ceiling.

## Roles, targets and the ceiling

Snapshots carry a role — clean, rhythm, chorus, solo — and each sits a chosen distance above the clean reference. Roles follow the patch, so naming one "solo" holds wherever that patch turns up.

The output block stops at +12 dB, so the snapshot needing the biggest boost caps everything else. The target row reports the most a gig can take and offers a value a few dB under it; anything the block can't reach is flagged rather than silently clamped.

The record offset turns the whole gig down before recording so hot presets don't clip on the way in. It costs nothing: every reading stamps the level it was taken through, so the offset is added straight back in the correction.

## Confirmed versions

A pass is frozen with its gains and the presets it was built from, so it keeps rebuilding after the live presets have moved on. Without that, the `.hls` was recomputed from whatever the readings happened to be, and a file you took to a gig quietly changed meaning the next time you recorded something.

## Presets library

The library DB (`data/soundpath.db`) is read-only in the UI. It's fed externally via `POST /api/presets/ingest` — [HelAIx](https://github.com/MrCitron/helaix) pushes its generated presets there.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- `@music-apps/gain-estimator` — BS.1770 loudness, region detection, the apply pipeline
- Prisma + SQLite for the presets library
- Documents on disk under `SOUNDPATH_PRESET_DIR`: `setlists/` for gigs, `leveling/` for single presets

## Setup

```bash
cp apps/soundpath/.env.example apps/soundpath/.env
```

Then point `SOUNDPATH_PRESET_DIR` at the folder for your `.hlx` files and stored documents. Defaults to `~/Documents/helix-presets/` if unset.

## Run

```bash
npm install
npm run dev:soundpath          # → http://localhost:3004/soundpath
```

Live capture needs a secure context — `localhost` directly, or HTTPS (`ngrok http 8080`) from other devices. Use the USB tap or line in, not a mic: a mic adds room coloration that has nothing to do with the patch.

## API

A gig and a single preset are the same document, so the two route trees mirror each other and share their actions (`src/lib/levelActions.ts`).

| Route | What it does |
|---|---|
| `GET /api/library` | Everything stored — setlists and presets, one row shape |
| `GET/POST/DELETE /api/setlist` | Read a gig / upload an `.hls` or accept a push from Setlists / delete it |
| `GET /api/setlist/plan` | The per-snapshot plan: target, correction, output level, what can't be reached |
| `PATCH/POST /api/setlist/[index]/measure` | Store one live reading / measure an uploaded `.wav` |
| `GET/POST /api/setlist/[index]/readings` | Readings this preset has from being levelled on its own, and take them |
| `PATCH /api/setlist/[index]/roles` | What each snapshot counts as |
| `PUT /api/setlist/loaded` | Declare which version is on the Helix right now |
| `GET/POST /api/setlist/versions` | List confirmed passes / freeze the current plan as the next one |
| `GET /api/setlist/export` | The levelled `.hls` — `?version=n`, or `original` for the unlevelled file |
| `GET /api/setlist/snapshots` | Per-song snapshot counts, for the Setlists app |
| `GET/POST/DELETE /api/level` | Preset levelling sessions — list, open one for a patch, drop it |
| `GET /api/level/plan`, `…/measure`, `…/roles`, `…/loaded`, `…/versions`, `…/export` | The same, scoped to one preset; export is a `.hlx` |
| `GET /api/presets`, `/api/presets/[id]`, `/api/presets/[id]/download` | Read the presets library |
| `POST /api/presets/ingest` | External ingest (HelAIx) |

## Bench

`/soundpath/measure` is a standalone bench: record takes, watch the proposed region, drag it, and check the input path isn't adding gain of its own. Nothing there is saved.

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
