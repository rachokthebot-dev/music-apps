import Link from "next/link";

/**
 * Recording guide for levelling a gig.
 *
 * Written from what actually went wrong doing this for real: clipped takes, a
 * preset silent because it wanted a Variax, one long recording that couldn't be
 * split reliably, a trim that had to travel with the readings — and the one
 * that cost a whole evening, recording through a file the app didn't know was
 * loaded, so every correction was applied twice.
 */

export const metadata = { title: "soundpath — recording guide" };

export default function Help() {
  return (
    <main className="p-6 max-w-3xl mx-auto min-h-screen">
      <header className="mb-8">
        <Link href="/setlist" className="text-xs text-muted-foreground hover:text-foreground underline">
          ← back to the setlist
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Recording guide</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Record your presets, and the gig gets levelled from what they really sound like.
        </p>
      </header>

      <Section title="The short version">
        <ol>
          <li>
            Download <strong>original .hls</strong> (or the version you want to build on) and load
            it onto the Helix.
          </li>
          <li>
            Set <strong>On the Helix right now</strong> to match what you just loaded. Everything
            depends on this.
          </li>
          <li><strong>Connect Helix</strong>. Check it says 2 channels.</li>
          <li><strong>Reset recordings</strong>, then <strong>record</strong> every snapshot.</li>
          <li><strong>Confirm levels</strong> → a new version. Download it and load it.</li>
        </ol>
        <LoopDiagram />
        <p>
          Sounds wrong? Set the baseline to the version you just loaded, reset, record again,
          confirm. Each pass corrects what&apos;s left, so it converges.
        </p>
      </Section>

      <Section title="The baseline — the one that bites">
        <p>
          A reading only means something next to the gain that produced it. Correcting a snapshot
          means moving it from where it <em>was</em>, so the app needs the level that was actually
          in force while you played.
        </p>
        <p>
          That is why <strong>On the Helix right now</strong> exists, and it is the only setting
          that is invisible when wrong. Load a levelled file, forget to say so, and the app reasons
          from the original preset instead — applying a correction on top of a correction. Nothing
          looks broken. The numbers stay plausible. The file is just wrong, by however much the
          loaded version had already moved things.
        </p>
        <p>
          Doing exactly that produced an <strong>11 dB error</strong>: one preset far too loud,
          another far too quiet, everything else fine. If a preset sounds badly off after a pass,
          suspect this before anything else.
        </p>
        <BaselineDiagram />
        <p>
          Downloading any version sets it for you, since that&apos;s the moment you&apos;re about to
          load it. If you download something and <em>don&apos;t</em> load it, set it back by hand.
        </p>
      </Section>

      <Section title="What LUFS means">
        <p>
          <strong>LUFS</strong> — Loudness Units relative to Full Scale — is the standard for
          measuring how loud something actually <em>sounds</em>. It&apos;s what streaming services
          use to stop one track blasting you after another.
        </p>
        <p>It differs from a normal meter in two ways:</p>
        <ul>
          <li>
            It weights frequencies the way ears do. We hear midrange as louder than bass or treble,
            so a mid-forward patch is scored as louder than a scooped one at the same meter reading.
          </li>
          <li>
            It averages over time and ignores silence, so a sustained chord and a short stab are
            compared fairly.
          </li>
        </ul>
        <p>
          Values are always negative — 0 LUFS is the loudest a digital signal can be. Streaming sits
          around −14. <strong>Only the differences matter here</strong>: your absolute numbers depend
          on how loud you recorded, but the gap between two presets is real.
        </p>
        <p>
          Why not just use a peak meter? A compressed lead and a clean tone can peak identically and
          sound nothing alike. Peaks measure the signal; LUFS measures what you hear.
        </p>
      </Section>

      <Section title="Why recordings, not a calculation">
        <p>
          You can&apos;t work out how loud a preset is by reading its file. Amps and pedals are
          non-linear, and loudness depends on the shape of the sound, not on adding up gain
          settings.
        </p>
        <p>
          This app used to try. It reported a gig as perfectly level while{" "}
          <strong>one preset sat 30 dB below another</strong>. Now every number comes from a real
          recording.
        </p>
      </Section>

      <Section title="Set the trim first">
        <p>
          Your loudest preset will clip long before the quiet ones are usable. A clipped chord
          measures <em>quieter</em> than it is, so it gets pushed the wrong way.
        </p>
        <ol>
          <li>
            Set <strong>New takes at</strong> to something like <code>-20</code> dB and download the{" "}
            <code>.hls</code>. Every preset drops by the same amount, so the differences between
            them — the only thing measured — don&apos;t change.
          </li>
          <li>Load it into HX Edit.</li>
          <li>
            Play your loudest patch and watch the meter. Well clear of red? Good. Still clipping?
            Increase the trim — at 24-bit a quiet recording is still miles above the noise floor.
          </li>
        </ol>
        <p>
          Each reading remembers the trim it was made at, so takes at different trims stay correct.
          But the value has to match what you really recorded through — get it wrong and everything
          lands off by that much.
        </p>
      </Section>

      <Section title="Recording — live, or from files">
        <p>
          <strong>record</strong> on a preset row captures straight off the Helix, one take per
          snapshot. Play the chord, let it ring out, stop — the reading is stored the moment you
          stop, and re-recording replaces it. Nothing to confirm.
        </p>
        <TakeDiagram />
        <p>
          Each take shows its waveform with the measured region shaded. The green line over it is
          momentary loudness, which is what makes the shape legible: where the note starts, whether
          it has decayed. Drag either edge to overrule the region and the reading updates.
        </p>
        <p>
          <strong>upload .wav</strong> is the other path: one file per preset with every snapshot
          played in order, a pause between. Useful if you&apos;d rather track in a DAW. It has to
          find exactly as many chords as the preset has snapshots, and refuses the whole file if it
          finds one too few — which on a quiet patch happens often. Live capture has no such
          failure, which is why it&apos;s the default.
        </p>
        <p>
          A single long take of the whole gig doesn&apos;t work either way: across a 50 dB setlist,
          the hiss between chords on a loud patch is louder than the actual notes on a quiet one, so
          there&apos;s no telling where one preset ends.
        </p>
      </Section>

      <Section title="Recording setup">
        <p>Over USB the Helix is an audio interface. Its main output is USB 1/2.</p>
        <p>For live capture in the browser:</p>
        <ul>
          <li>
            <strong>Use Chrome.</strong> It reports whether the input is being processed and gives
            you both channels. Safari hands back mono, and a mono downmix loses 3 dB on a dry patch
            but 6 dB on a wide one — so the error rides on how much stereo each snapshot has and
            doesn&apos;t cancel between them. The header says <code>mono ⚠</code> if this happens.
          </li>
          <li>
            <strong>https or localhost.</strong> Browsers refuse the microphone on a plain LAN
            address. On the machine running the app, <code>localhost</code> is simplest.
          </li>
          <li>
            <strong>Check Mic Mode in Control Center</strong> is <em>Standard</em>, not Voice
            Isolation. macOS applies that upstream of the browser, so the panel can&apos;t see it.
          </li>
          <li>
            Watch the meter to confirm you&apos;ve got the Helix and not the built-in mic: if it
            moves when you <em>talk</em>, it&apos;s the room.
          </li>
        </ul>
        <p>If you&apos;d rather record in a DAW and upload files:</p>
        <ul>
          <li>
            <strong>GarageBand:</strong> Settings → Audio/MIDI → Input Device →{" "}
            <code>HELIX Audio</code>. New track → <strong>Mic or Line</strong> (not Guitar or Bass —
            that adds GarageBand&apos;s own amps) → Input <strong>1 + 2</strong>, stereo.
          </li>
          <li>
            Turn off every plug-in on the track <em>and</em> the Master. GarageBand puts a Limiter
            and Compressor on the Master by default, and a limiter quietly squashes your loud
            snapshots toward the quiet ones — faking the alignment you&apos;re trying to measure.
          </li>
          <li><strong>Noise Gate off.</strong> It cuts chord tails and changes every reading.</li>
          <li>Export as uncompressed WAV.</li>
        </ul>
        <p>
          There&apos;s no input gain to set — USB is digital, so the level arrives fixed from the
          Helix, and nothing on the computer can drift between sessions.
        </p>
      </Section>

      <Section title="Playing the take">
        <ul>
          <li>Same chord, same fret, same picking force every time. That consistency is the measurement.</li>
          <li>Let it ring ~4 seconds, mute the strings, pause, switch, next.</li>
          <li>Pauses can be any length.</li>
          <li>Fumbled one? Play it again straight away without pausing, or re-record that preset.</li>
        </ul>
      </Section>

      <Section title="Roles">
        <p>
          Each snapshot is <strong>clean</strong>, <strong>rhythm</strong>, <strong>chorus</strong>{" "}
          or <strong>solo</strong>. Clean is the reference; the steppers set how far above it the
          others sit.
        </p>
        <p>
          Roles are guessed from snapshot names and are often wrong — &ldquo;OD Wah Wah&rdquo; reads
          as neither, and a preset&apos;s &ldquo;Main&rdquo; might be its loudest sound. Fix them in
          the table. Anything you set by hand stays set.
        </p>
        <ReferenceDiagram />
        <p>
          The <code>.hls</code> is rebuilt every time you download it, so changes are already in the
          next file. There&apos;s no apply button.
        </p>
      </Section>

      <Section title="Where the level is changed">
        <p>
          In the <strong>output block</strong> — the last thing before the jacks, after the amp, cab
          and effects. It changes volume without touching tone.
        </p>
        <ChainDiagram />
        <p>
          Not Channel Volume, which sits inside the amp and changes how hard it&apos;s driven. And
          not a gain block in a free slot — free slots are usually <em>before</em> the amp, where
          gain changes distortion instead of level. That mistake once took 14 dB off a high-gain
          preset and left it just as loud.
        </p>
      </Section>

      <Section title="If something looks wrong">
        <ul>
          <li>
            <strong>&ldquo;Found N chords but the preset has M snapshots&rdquo;</strong> — a missed
            or doubled chord. Re-record that preset.
          </li>
          <li>
            <strong>&ldquo;Clipped at 0 dBFS&rdquo;</strong> — increase the trim, redo that one.
          </li>
          <li>
            <strong>Silence.</strong> Check the preset&apos;s input block. One patch here was set to{" "}
            <strong>Variax</strong> and made no sound at all on a normal guitar.
          </li>
          <li>
            <strong>⚠ on a correction</strong> — the output block stops at +12 dB and can&apos;t
            reach. Fix that preset at the source instead.
          </li>
        </ul>
      </Section>

      <Section title="Versions">
        <p>
          <strong>Confirm levels</strong> freezes the current plan as a numbered version. Until you
          do, a download is only a preview — re-record one song and the file you took to the gig
          would have quietly meant something else.
        </p>
        <p>
          A version keeps its own finished presets, so it stays downloadable no matter what happens
          to the live ones afterwards. The number goes in the setlist name as well as the filename,
          so the Helix itself shows which pass is loaded — mid-gig that&apos;s the only place you
          can check.
        </p>
        <p>
          Numbers are chronological. Confirming always gives you the next one up, whichever version
          you measured through.
        </p>
        <p>
          Confirming needs every snapshot recorded. The reference is averaged across the whole gig,
          so a half-measured setlist doesn&apos;t give you a half-answer — it gives you a reference
          computed from whichever songs happened to be done, and moves every gain.
        </p>
      </Section>

      <Section title="When the pedal is ahead of the app">
        <p>
          You changed a patch at soundcheck, or between songs, and the Helix no longer matches what
          the app has. Export from HX Edit and use <strong>Replace presets from .hls</strong> on the
          setlist.
        </p>
        <p>
          The gig keeps its identity, its role settings and its version history. The presets are
          replaced and <strong>every reading is cleared</strong> — they measured patches that no
          longer exist. Earlier versions stay downloadable, because each one carries its own copy.
        </p>
        <p>
          A gig that has nothing to do with this one belongs on the Library page instead, where{" "}
          <strong>Upload .hls</strong> starts its own session.
        </p>
      </Section>

      <Section title="Reset recordings">
        <p>
          Clears every reading so the next pass starts clean. Confirmed versions are untouched and
          stay downloadable — it starts the next pass, it doesn&apos;t retract the last one.
        </p>
        <p>
          It&apos;s all-or-nothing on purpose. Levelling assumes every reading came from one sitting
          with nothing on the Helix touched in between, so a half-replaced set is exactly the
          mixture that produces wrong levels with nothing visibly amiss.
        </p>
      </Section>

      <Section title="One pass, one sitting">
        <p>
          Record the whole gig in one go, without changing anything on the Helix — no volume knob,
          no global settings, no swapping guitars. The reference is an average across every reading,
          so anything that shifts the level partway through tilts everything recorded before it.
        </p>
        <p>
          Readings don&apos;t travel between setlists. The same patch in another gig gets recorded
          again, because a number taken on a different day through a setup the app can&apos;t see is
          exactly the stale input this is meant to exclude. Roles do carry over — those are a
          labelling decision about the song, not a measurement.
        </p>
        <p>
          Bear in mind what&apos;s actually being measured: a recording of <em>you playing</em>
          {" "}through the patch. Play a chord on one snapshot and a single note on the next and the
          reading will say the second is quieter, because for that input it was.
        </p>
      </Section>

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

/**
 * Diagrams.
 *
 * Inline SVG rather than images: no asset pipeline, no basePath coupling, and
 * they follow the theme because everything is drawn in currentColor or a
 * Tailwind class. Sized by viewBox so they scale down to a phone.
 */
function Figure({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="my-4">
      <svg viewBox="0 0 720 160" role="img" aria-label={label} className="w-full h-auto">
        {children}
      </svg>
      {caption && (
        <figcaption className="text-[11.5px] text-muted-foreground mt-1.5">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Rounded step box with a title and an optional second line. */
function Step({
  x,
  y = 30,
  w = 118,
  title,
  sub,
  accent,
}: {
  x: number;
  y?: number;
  w?: number;
  title: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={sub ? 46 : 34}
        rx={7}
        className={
          accent
            ? "fill-violet-500/15 stroke-violet-500/60"
            : "fill-transparent stroke-current opacity-90"
        }
        strokeWidth={1.2}
      />
      <text
        x={x + w / 2}
        y={y + (sub ? 19 : 22)}
        textAnchor="middle"
        className="fill-current text-[12px] font-semibold"
      >
        {title}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + 35}
          textAnchor="middle"
          className="fill-current opacity-60 text-[10.5px]"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, x2, y = 53 }: { x1: number; x2: number; y?: number }) {
  return (
    <g className="stroke-current opacity-50" strokeWidth={1.3} fill="none">
      <line x1={x1} y1={y} x2={x2 - 5} y2={y} />
      <polyline points={`${x2 - 9},${y - 4} ${x2 - 3},${y} ${x2 - 9},${y + 4}`} />
    </g>
  );
}

/** The pass, and the loop back into it. */
function LoopDiagram() {
  return (
    <Figure
      label="The levelling loop: download, load, set baseline, record, confirm — then repeat if needed"
      caption="Each pass corrects what the last one left. Because the baseline follows the file on the pedal, the corrections shrink each time instead of stacking."
    >
      <Step x={4} title="Download" sub="original or a version" />
      <Arrow x1={122} x2={140} />
      <Step x={140} title="Load on Helix" sub="via HX Edit" />
      <Arrow x1={258} x2={276} />
      <Step x={276} title="Set baseline" sub="On the Helix right now" accent />
      <Arrow x1={394} x2={412} />
      <Step x={412} title="Record all" sub="one sitting" />
      <Arrow x1={530} x2={548} />
      <Step x={548} title="Confirm" sub="→ next version" accent />
      {/* loop back */}
      <g className="stroke-current opacity-40" strokeWidth={1.2} fill="none">
        <path d="M607 76 L607 116 L63 116 L63 76" />
        <polyline points="59,82 63,74 67,82" />
      </g>
      <text x={335} y={132} textAnchor="middle" className="fill-current opacity-55 text-[11px]">
        still not right? go round again — reset recordings first
      </text>
    </Figure>
  );
}

/** Why the baseline matters, as two outcomes side by side. */
function BaselineDiagram() {
  const bar = (x: number, y: number, from: number, to: number, cls: string) => (
    <g>
      <line x1={x} y1={y} x2={x + 150} y2={y} className="stroke-current opacity-20" strokeWidth={1} />
      <circle cx={x + from} cy={y} r={4} className="fill-current opacity-45" />
      <line x1={x + from} y1={y} x2={x + to} y2={y} className={cls} strokeWidth={2.5} />
      <circle cx={x + to} cy={y} r={4.5} className={cls.replace("stroke", "fill")} />
    </g>
  );
  return (
    <Figure
      label="Baseline correct versus baseline wrong: the same recording produces either the right level or a doubled correction"
      caption="Same pedal, same playing. The only difference is whether the app knows which file is loaded."
    >
      {/* left: correct */}
      <text x={12} y={20} className="fill-emerald-500 text-[12px] font-semibold">
        Baseline says v1 — correct
      </text>
      <text x={12} y={44} className="fill-current opacity-60 text-[11px]">
        pedal is at −8, app knows it
      </text>
      {bar(20, 68, 130, 130, "stroke-emerald-500")}
      <text x={12} y={96} className="fill-current opacity-70 text-[11px]">
        correction +0 → stays at −8 dB
      </text>
      <text x={12} y={116} className="fill-emerald-500 text-[11px] font-semibold">
        settled
      </text>

      {/* divider */}
      <line x1={360} y1={8} x2={360} y2={150} className="stroke-current opacity-15" strokeWidth={1} />

      {/* right: wrong */}
      <text x={384} y={20} className="fill-rose-500 text-[12px] font-semibold">
        Baseline says original — wrong
      </text>
      <text x={384} y={44} className="fill-current opacity-60 text-[11px]">
        pedal is at −8, app assumes 0
      </text>
      {bar(392, 68, 130, 20, "stroke-rose-500")}
      <text x={384} y={96} className="fill-current opacity-70 text-[11px]">
        correction −8 applied a second time
      </text>
      <text x={384} y={116} className="fill-rose-500 text-[11px] font-semibold">
        lands at −16 dB — inaudibly wrong on screen
      </text>
    </Figure>
  );
}

/** What a good take looks like, and which part is measured. */
function TakeDiagram() {
  return (
    <Figure
      label="Anatomy of a take: silence, attack, the measured region, decay, silence"
      caption="The quiet at both ends is what proves nothing is adding gain. A take that never goes quiet gives no verdict."
    >
      <rect x={150} y={26} width={230} height={82} rx={4} className="fill-violet-500/15" />
      <line x1={150} y1={26} x2={150} y2={108} className="stroke-violet-500" strokeWidth={2} />
      <line x1={380} y1={26} x2={380} y2={108} className="stroke-violet-500" strokeWidth={2} />
      {/* the take itself */}
      <path
        d="M10 67 L146 67 L152 30 L158 104 L165 38 L172 96 L180 44 L190 90 L205 50 L225 84
           L250 55 L280 79 L320 59 L360 74 L400 63 L440 70 L490 65 L540 68 L700 67"
        className="stroke-current opacity-70"
        strokeWidth={1.2}
        fill="none"
      />
      <text x={70} y={128} textAnchor="middle" className="fill-current opacity-60 text-[11px]">
        wait a beat
      </text>
      <text x={265} y={128} textAnchor="middle" className="fill-violet-500 text-[11px] font-semibold">
        measured region — 3 s from the onset
      </text>
      <text x={545} y={128} textAnchor="middle" className="fill-current opacity-60 text-[11px]">
        let it decay, then stop
      </text>
      <text x={265} y={18} textAnchor="middle" className="fill-current opacity-55 text-[10.5px]">
        drag either edge to overrule it
      </text>
    </Figure>
  );
}

/** Where in the chain the level is written. */
function ChainDiagram() {
  return (
    <Figure
      label="Signal chain: the level is written on the path output block, the last stage before the jacks"
      caption="Never Channel Volume or an inserted gain block — those sit in front of the amp, where they change how hard it is driven and so change the tone, not just the level."
    >
      <Step x={4} y={40} w={92} title="Guitar" />
      <Arrow x1={100} x2={116} y={57} />
      <Step x={116} y={40} w={92} title="Drive" sub="etc." />
      <Arrow x1={212} x2={228} y={57} />
      <Step x={228} y={40} w={92} title="Amp" />
      <Arrow x1={324} x2={340} y={57} />
      <Step x={340} y={40} w={92} title="Cab / IR" />
      <Arrow x1={436} x2={452} y={57} />
      <Step x={452} y={40} w={130} title="Output block" sub="level written here" accent />
      <Arrow x1={586} x2={602} y={57} />
      <Step x={602} y={40} w={110} title="Jacks + USB" />
      <text x={517} y={110} textAnchor="middle" className="fill-violet-500 text-[11px] font-semibold">
        ↑ the only thing this app changes
      </text>
      <text x={240} y={132} textAnchor="middle" className="fill-current opacity-55 text-[11px]">
        On a split preset the chain ends on path 2 — that path&apos;s output block is the one adjusted.
      </text>
    </Figure>
  );
}

/** How the reference and role targets relate to the measurements. */
function ReferenceDiagram() {
  const REF = 330;
  // measured x, role, target offset in dB, whether the block can reach it
  const rows: Array<[string, number, number, boolean]> = [
    ["clean", 250, 0, true],
    ["rhythm", 470, 1.5, true],
    ["solo", 300, 3, true],
    ["wet", 90, 1.5, false],
  ];
  const px = (db: number) => REF + db * 26;
  return (
    <Figure
      label="The reference is the average of measured loudness minus each snapshot's role offset; every snapshot is then moved to its role's target"
      caption="Each snapshot is dragged to the target for its role. A snapshot the output block can't reach is left out of the average entirely — a take that will sit low whatever happens shouldn't pull the whole gig down toward it."
    >
      <line x1={330} y1={16} x2={330} y2={124} className="stroke-emerald-500" strokeWidth={1.6} strokeDasharray="4 3" />
      <text x={330} y={12} textAnchor="middle" className="fill-emerald-500 text-[11px] font-semibold">
        reference
      </text>
      {rows.map(([role, mx, off, ok], i) => {
        const y = 34 + i * 24;
        const tx = px(off);
        const dim = ok ? "" : " opacity-35";
        return (
          <g key={role}>
            <text x={10} y={y + 4} className={"fill-current opacity-70 text-[11px]" + dim}>
              {role}
            </text>
            <circle cx={mx} cy={y} r={4.5} className={"fill-current opacity-50" + dim} />
            <g className={"stroke-current opacity-40" + dim} strokeWidth={1.4} fill="none">
              <line x1={mx + (tx > mx ? 6 : -6)} y1={y} x2={tx + (tx > mx ? -8 : 8)} y2={y} strokeDasharray="3 3" />
              <polyline
                points={`${tx + (tx > mx ? -11 : 11)},${y - 4} ${tx + (tx > mx ? -5 : 5)},${y} ${tx + (tx > mx ? -11 : 11)},${y + 4}`}
              />
            </g>
            <circle cx={tx} cy={y} r={5} className={ok ? "fill-violet-500" : "fill-current opacity-25"} />
            {/* Label goes on the far side of the target from the arrow, or the
                dashed line runs straight through the text. An unreachable
                snapshot gets no target label — it never arrives, and saying so
                twice on one row just collides. */}
            {ok ? (
              <text
                x={tx > mx ? tx + 12 : tx - 12}
                y={y + 4}
                textAnchor={tx > mx ? "start" : "end"}
                className="fill-current opacity-60 text-[10.5px]"
              >
                {off === 0 ? "target — clean" : `target +${off.toFixed(1)} over clean`}
              </text>
            ) : (
              <text x={tx + 14} y={y + 4} className="fill-amber-500 text-[10px] font-semibold">
                can&apos;t reach it — left out of the average
              </text>
            )}
          </g>
        );
      })}
      <text x={150} y={148} className="fill-current opacity-50 text-[10.5px]">
        ● measured
      </text>
      <text x={250} y={148} className="fill-violet-500 text-[10.5px]">
        ● where it ends up
      </text>
      <text x={620} y={148} className="fill-current opacity-45 text-[10.5px]">
        louder →
      </text>
    </Figure>
  );
}
