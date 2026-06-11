# helix-builder

Build-time Python tooling that converts a sound-description spec (JSON) into a Helix `.hlx` preset file. Used by SoundPath's Design Preset flow to regenerate the skeleton template that ships with the `gain-estimator` package.

**Not required to run any of the apps.** The data this tooling generates (`skeleton.hlx.json`, the block catalog) is already vendored into `packages/gain-estimator/data/`, so SoundPath works without ever running these scripts.

## Why it isn't a turnkey install

This package builds on top of **phelix**, a third-party Python library that does the actual `.hlx` serialization. phelix is **GPL v3**, which is copyleft and incompatible with this monorepo's MIT license. To stay legally clean, phelix is **not bundled** here — you'd need to clone it into `./phelix/` yourself if you want to run `build.py`.

If you just want to use the block catalog (the data we depend on at runtime), use **HelAIx** instead — it's MIT-licensed and provides the same information in a more polished form.

## HelAIx — the recommended catalog source

[HelAIx](https://github.com/MrCitron/helaix) is an MIT-licensed Helix preset designer that ships a complete block catalog (367 entries: friendly names, real-world equivalents, parameter ranges, DSP cost). The version of this catalog we use at runtime is already vendored from HelAIx into `packages/gain-estimator/data/helaix-catalog.json` (see [CREDITS.md](../gain-estimator/data/CREDITS.md) there).

If you want to regenerate or update the catalog:

1. Clone HelAIx: `git clone https://github.com/MrCitron/helaix`
2. Copy `app/pkg/helix/data/catalog.json` to `packages/gain-estimator/data/helaix-catalog.json`

If you want to run HelAIx's preset-designer UI alongside SoundPath, a Go HTTP server port of it can be added at port 3005; see the soundpath vault notes for the integration sketch.

## Running build.py (advanced — requires phelix)

If you actually want to regenerate `skeleton.hlx.json` from scratch:

```bash
# 1. Get phelix (GPL v3 — installed separately, not bundled)
git clone <phelix-upstream> packages/helix-builder/phelix

# 2. Build a single .hlx from a spec
python3 packages/helix-builder/build.py spec.json out.hlx

# 3. Patch a single snapshot in an existing master
python3 packages/helix-builder/build_snapshot.py snap-spec.json out.hlx \
  --master templates/master.hlx
```

See `PROMPT.md` for the LLM prompt that converts free-form sound descriptions into the JSON spec format `build.py` expects.

## Why this directory exists in the repo at all

The wrapper scripts here (`build.py`, `build_snapshot.py`, `test_all.py`, etc.) are mine and MIT-licensed under the repo. They're shipped as reference and as the build path I actually use locally when I need to regenerate the skeleton. Anyone reading SoundPath's code will eventually wonder where `skeleton.hlx.json` came from — this directory is the answer.

## License

The wrapper scripts in this directory are MIT (under the repo LICENSE). phelix, if you install it, is GPL v3 and lives under its own license terms in your own `./phelix/` clone.
