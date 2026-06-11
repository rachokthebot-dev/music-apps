/**
 * Shared path resolver for the smoke scripts. None of these scripts ship as
 * part of the published app — they're diagnostic runners that need any real
 * Helix .hlx to chew on.
 *
 * Resolution order:
 *   1. CLI arg (first positional)
 *   2. $SOUNDPATH_PRESET_DIR + filenameHint (if env is set)
 *   3. ~/Documents/helix-presets/seed.hlx
 *   4. first .hlx found in ~/Documents/helix-presets/
 *
 * Prints a friendly error and exits 1 if nothing is found.
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveMasterPath(filenameHint = "seed.hlx"): string {
  const argv = process.argv[2];
  if (argv && existsSync(argv)) return argv;

  const envDir = process.env.SOUNDPATH_PRESET_DIR?.trim();
  if (envDir) {
    const candidate = join(
      envDir.startsWith("~/") ? join(homedir(), envDir.slice(2)) : envDir,
      filenameHint
    );
    if (existsSync(candidate)) return candidate;
  }

  const defaultDir = join(homedir(), "Documents", "helix-presets");
  const defaultSeed = join(defaultDir, filenameHint);
  if (existsSync(defaultSeed)) return defaultSeed;

  if (existsSync(defaultDir)) {
    const hlx = readdirSync(defaultDir).find((f) => f.toLowerCase().endsWith(".hlx"));
    if (hlx) return join(defaultDir, hlx);
  }

  console.error(
    [
      `Could not find a .hlx preset to smoke-test against.`,
      ``,
      `Provide one of:`,
      `  1. CLI arg:        npx tsx <script> /path/to/preset.hlx`,
      `  2. Env var + file: SOUNDPATH_PRESET_DIR=~/my/dir, with ${filenameHint} inside`,
      `  3. Default:        drop any .hlx into ~/Documents/helix-presets/`,
    ].join("\n")
  );
  process.exit(1);
}
