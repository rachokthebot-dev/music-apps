import Link from "next/link";

/**
 * Recording guide for the Measure feature — how to capture each snapshot's
 * real output so the BS.1770 measurement is trustworthy.
 */

export const metadata = { title: "soundpath — recording guide" };

export default function Help() {
  return (
    <main className="p-6 max-w-3xl mx-auto min-h-screen">
      <header className="mb-8">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground underline">
          ← back to soundpath
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Recording guide</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How to capture each snapshot for <span className="text-foreground">Measure</span> — live in
          the browser, with GarageBand, or with any WAV recorder.
        </p>
      </header>

      <Section title="How Measure works">
        <p>
          The estimator <em>predicts</em> each snapshot&apos;s loudness from the preset file; it
          never hears the patch. Measure records the real output, computes integrated loudness
          (ITU-R BS.1770 LUFS), and shows the residual — how far the estimate is off. Everything is
          compared <strong>relative to snapshot 0</strong>, so absolute levels don&apos;t matter;
          what matters is that nothing changes the gain <em>between</em> your takes.
        </p>
        <ul>
          <li>
            <span className="text-emerald-600 dark:text-emerald-400">green</span> residual &lt;1 dB ·{" "}
            <span className="text-amber-600 dark:text-amber-400">amber</span> &lt;3 dB ·{" "}
            <span className="text-red-600 dark:text-red-400">red</span> ≥3 dB off
          </li>
          <li>Re-measuring a snapshot overwrites it; importing a new preset clears the slot&apos;s measurements.</li>
        </ul>
      </Section>

      <Section title="Connect the Helix">
        <p>
          The Helix LT is a class-compliant USB audio interface — connect it directly, no extra
          hardware:
        </p>
        <ul>
          <li>
            <strong>Mac:</strong> Helix USB-B → any USB port. It shows up as an audio input device.
          </li>
          <li>
            <strong>iPad (USB-C):</strong> Helix USB-B → USB-C cable.
          </li>
          <li>
            <strong>iPad (Lightning):</strong> Helix USB-B → USB-A cable → Apple Lightning-to-USB
            (camera) adapter.
          </li>
        </ul>
        <p>
          USB channels 1/2 carry the processed stereo output of the current preset — the same
          signal as the main outs, and exactly what the estimator models. The Helix is self-powered
          and runs at 48 kHz, which matches what the measurement expects.
        </p>
        <p className="text-muted-foreground">
          Use USB (or line-in), <strong>not a microphone</strong> — a mic in front of a cab adds
          room and speaker coloration the estimator never models, so it calibrates against the
          wrong target.
        </p>
      </Section>

      <Section title="Option 1 — record directly in the browser (● Rec)">
        <ol>
          <li>
            Open soundpath in a <strong>secure context</strong>: on the Mac use{" "}
            <code>localhost</code> directly; from an iPad use the HTTPS (ngrok) URL. Plain{" "}
            <code>http://</code> over the LAN loads the app but the browser blocks recording — use
            WAV upload there instead.
          </li>
          <li>Open <strong>Measure</strong> on the pane and pick the Helix in the <strong>Input</strong> selector.</li>
          <li>
            Per snapshot: select it on the Helix, hit <strong>● Rec</strong>, play a few seconds of
            full chords, hit <strong>■ Stop</strong>. The row fills in with measured LUFS +
            residual.
          </li>
        </ol>
        <p>
          The app pins a 48 kHz context and disables auto-gain, noise suppression, and echo
          cancellation automatically (any of those would corrupt the reading). First ● Rec triggers
          the browser&apos;s mic-permission prompt.
        </p>
      </Section>

      <Section title="Option 2 — GarageBand (iPad or Mac)">
        <ol>
          <li>Connect the Helix as above and open GarageBand.</li>
          <li>
            Create an <strong>Audio Recorder / audio track</strong> with the Helix as input.
            Turn <strong>off</strong> monitoring effects and any plugins on the track — you want the
            raw interface signal.
          </li>
          <li>Set input gain once and <strong>don&apos;t touch it again</strong> across all 8 takes.</li>
          <li>Record one region per snapshot (a few seconds of full chords each).</li>
          <li>
            Export each take as <strong>uncompressed WAV</strong> (Share → Song → Uncompressed).
            Compressed AAC/m4a is rejected by the upload.
          </li>
          <li>
            In Measure, use the <strong>WAV</strong> button on the matching snapshot row to upload
            each file. Upload works over plain HTTP on the LAN — no ngrok needed.
          </li>
        </ol>
      </Section>

      <Section title="Option 3 — any other recorder app">
        <p>The app doesn&apos;t matter as long as the capture meets these requirements:</p>
        <ul>
          <li><strong>WAV format</strong> (PCM or float) — that&apos;s all the upload accepts.</li>
          <li>
            <strong>No auto-gain / “enhance” processing.</strong> This is the deal-breaker: if the
            app rides the gain between quiet and loud takes, the snapshot-to-snapshot deltas become
            meaningless. A constant gain offset is fine — it cancels out.
          </li>
          <li>48 kHz preferred (other rates work; the decoder resamples the math, not the audio).</li>
          <li>At least ~1 second above −70 LUFS — a few seconds of full chords is ideal.</li>
        </ul>
        <p>
          Known-good iPad choices: <strong>Voice Record Pro</strong> (set format to WAV, 48 kHz),{" "}
          <strong>AudioShare</strong>. On the Mac: QuickTime (then convert to WAV) or Audacity.
        </p>
        <p className="text-muted-foreground">
          <strong>Why not Voice Memos:</strong> it records compressed m4a (rejected by the upload)
          and applies input processing you can&apos;t switch off — exactly the auto-gain problem
          above.
        </p>
      </Section>

      <Section title="Rules that apply to every method">
        <ul>
          <li>Same guitar, same pickup, comparable playing on every take.</li>
          <li>No gain/volume changes anywhere in the capture chain between snapshots.</li>
          <li>One file / one recording per snapshot, uploaded to the matching row.</li>
          <li>
            Measure both presets&apos; baselines with the same setup if you want a ground-truth
            check of the cross-preset delta.
          </li>
        </ul>
      </Section>

      <footer className="mt-10 pt-4 border-t border-border text-xs text-muted-foreground/70">
        Estimator models are first-order approximations (±1–3 dB per block) — Measure exists to
        show you exactly how far off they are for your presets.
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-foreground mb-2">{title}</h2>
      <div className="space-y-2 text-sm text-foreground/80 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_code]:text-foreground [&_code]:bg-secondary [&_code]:px-1 [&_code]:rounded">
        {children}
      </div>
    </section>
  );
}
