import { SidebarMenuButton } from "@music-apps/shared/app-shell";
import { Shell } from "@/components/Shell";

/**
 * Recording guide: every view, in plain steps.
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
    <Shell>
    <main className="w-full px-4 lg:px-8 py-4 lg:py-6 max-w-3xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-1">
          <SidebarMenuButton />
          <h1 className="text-2xl font-semibold tracking-tight">Recording guide</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          SoundPath makes your Helix sounds sit at the right volume next to each other. You play,
          it listens, and it tells you — or writes into the preset — how much to turn each one up
          or down.
        </p>
      </header>

      <Section title="The four views">
        <ul>
          <li>
            <strong>Library</strong>{" "}— every setlist and preset stored here, plus presets sent over
            from HelAIx. Open one to work on it.
          </li>
          <li>
            <strong>Quick level</strong>{" "}— check whatever is on the Helix right now. Nothing to
            load, nothing saved.
          </li>
          <li>
            <strong>Preset</strong>{" "}— level one <code>.hlx</code>{" "}on its own. Download the levelled
            file when you&apos;re done.
          </li>
          <li>
            <strong>Setlist</strong>{" "}— level a whole gig (<code>.hls</code>) so nothing jumps
            between songs.
          </li>
        </ul>
      </Section>

      <Section title="Before you record">
        <ul>
          <li>Connect the Helix by USB. It acts as the audio interface — no input gain to set.</li>
          <li>
            Use <strong>Chrome</strong>, on <code>localhost</code>{" "}or https. Safari gives mono,
            which reads a few dB wrong; a plain LAN address can&apos;t use the microphone at all.
          </li>
          <li>
            Set macOS <strong>Mic Mode</strong>{" "}(Control Center) to <em>Standard</em>, not Voice
            Isolation.
          </li>
          <li>
            Check you&apos;ve got the Helix: the meter should move when you play, not when you
            talk, and it should say <strong>2 channels</strong>.
          </li>
        </ul>
      </Section>

      <Section title="Playing a take">
        <ul>
          <li>Press record, wait a second, then play one chord.</li>
          <li>
            Let it ring out to silence before stopping. The quiet before and after is how the app
            checks nothing is adding gain.
          </li>
          <li>Same chord, same fret, same picking strength every time.</li>
        </ul>
        <TakeDiagram />
        <p>
          The shaded band is the part that&apos;s measured — just after the pick attack, so it
          measures the patch rather than your right hand. Drag either edge if it landed in the
          wrong place. A take that <strong>clipped</strong>{" "}is refused: turn the level down and play
          it again.
        </p>
      </Section>

      <Section title="Quick level — check one sound">
        <ol>
          <li>Open <strong>Quick level</strong>, enable the input, record one take.</li>
          <li>
            The table shows clean, rhythm, chorus and solo, each with how many dB to add to the
            Output block Level for this sound to land there.
          </li>
          <li>
            Pick the row for what this sound is meant to be, change the Output block by that much,
            record again. It should now read close to zero.
          </li>
        </ol>
        <p>
          The Rhythm / Chorus / Solo steppers set how far above clean each role sits. They&apos;re
          remembered for Quick level; gigs and presets keep their own.
        </p>
      </Section>

      <Section title="Level one preset">
        <ol>
          <li>
            Open <strong>Preset</strong>{" "}and upload a <code>.hlx</code>, or pick one from the
            Library (HelAIx presets land there).
          </li>
          <li>
            Download <strong>original .hlx</strong>{" "}and load it onto the Helix. Check{" "}
            <strong>On the Helix right now</strong>{" "}says the same — see below.
          </li>
          <li><strong>Connect Helix</strong>, then record each snapshot.</li>
          <li>
            <strong>Confirm</strong> → a new version. Download it and load it onto the Helix.
          </li>
        </ol>
        <LoopDiagram />
        <p>
          Still something off? Record again through the version you just loaded and confirm again.
          Each pass fixes what&apos;s left.
        </p>
      </Section>

      <Section title="Level a whole gig">
        <p>
          The same steps as a preset, for a whole setlist: open it in <strong>Setlist</strong>{" "}
          (<strong>Upload .hls</strong>, or one sent from the Setlists app), load the{" "}
          <strong>original .hls</strong>, record every snapshot of every song, confirm, load the
          new version.
        </p>
        <p>
          One song changed? <strong>level on its own ↗</strong>{" "}on its row opens it in Preset. Once
          it&apos;s recorded there, the row shows <em>readings ready</em>{" "}—{" "}
          <strong>use them</strong>{" "}and you don&apos;t have to re-record the whole gig. That needs
          the gig to have a fixed target level (next section).
        </p>
      </Section>

      <Section title="Roles and the target">
        <p>
          Every snapshot is <strong>clean</strong>, <strong>rhythm</strong>, <strong>chorus</strong>{" "}
          or <strong>solo</strong>. Roles are guessed from snapshot names — check them, and fix any
          that are wrong in the table. What you set stays set, and follows the patch into other
          gigs.
        </p>
        <p>
          <strong>Target level</strong>{" "}is where clean lands, in LUFS. Leave it fixed (−18 by
          default) so every gig and preset ends up at the same volume. The steppers set how far
          above clean the other roles sit.
        </p>
        <ReferenceDiagram />
        <p>
          The Output block can only go up to +12 dB. If a snapshot can&apos;t reach its target it&apos;s
          flagged ⚠ rather than quietly left short — lower the target, or turn that preset up at the
          amp.
        </p>
      </Section>

      <Section title="On the Helix right now">
        <p>
          Tell the app which file is on the pedal while you record: the original, or a version you
          confirmed. The correction is worked out from that, so if it&apos;s wrong, the result is
          wrong by the same amount — and nothing looks broken.
        </p>
        <BaselineDiagram />
        <p>
          Downloading a file sets this for you. If you download something and <em>don&apos;t</em>{" "}
          load it, set it back by hand. If a preset sounds badly off after a pass, check this first.
        </p>
      </Section>

      <Section title="Presets too hot to record">
        <p>
          If your loudest presets clip on the way in, turn the whole gig down before recording: set
          the offset next to the <strong>original</strong>{" "}download (e.g. −20 dB), tick{" "}
          <em>in the loaded file</em>, and download again. Every preset drops by the same amount.
        </p>
        <p>
          It doesn&apos;t change the result — the app adds the offset straight back when it works
          out the correction.
        </p>
      </Section>

      <Section title="Versions, reset and replace">
        <ul>
          <li>
            <strong>Confirm</strong>{" "}freezes the current levels as v1, v2… A version keeps its own
            copy of the presets, so it can always be downloaded again. The number is in the setlist
            name, so the Helix shows which one is loaded.
          </li>
          <li>
            Before you confirm, the download is a <strong>preview</strong>{" "}— it changes whenever a
            reading does. You can confirm a partly recorded gig; it&apos;s marked partial.
          </li>
          <li>
            <strong>Reset recordings</strong>{" "}clears every reading for a fresh pass. Versions stay.
          </li>
          <li>
            <strong>Replace from .hls</strong>{" "}— you changed presets on the pedal. It swaps in the
            new presets and clears the readings, but keeps roles, settings and version history.
          </li>
        </ul>
      </Section>

      <Section title="Where the level is changed">
        <p>
          Always the <strong>Output block</strong>{" "}— the last block, after amp, cab and effects.
          It changes volume without changing the tone.
        </p>
        <ChainDiagram />
        <p>
          Not Channel Volume or a gain block before the amp: those change how hard the amp is
          driven, so the distortion changes and the volume barely does.
        </p>
      </Section>

      <Section title="Recording in a DAW instead">
        <p>
          Prefer GarageBand or similar? Record one file per preset — every snapshot in order, a
          pause between — and use <strong>upload .wav</strong>{" "}on that preset.
        </p>
        <ul>
          <li>Input <code>HELIX Audio</code>{" "}1 + 2, stereo, on a Mic or Line track.</li>
          <li>
            Turn off every plug-in, including the Limiter and Compressor GarageBand puts on the
            Master, and the Noise Gate.
          </li>
          <li>Export uncompressed WAV.</li>
        </ul>
        <p>
          It must find exactly one chord per snapshot, and quiet patches often confuse it — live
          recording is the more reliable path.
        </p>
      </Section>

      <Section title="If something looks wrong">
        <ul>
          <li>
            <strong>Clipped</strong>{" "}— turn down (Output block, or the record offset) and record
            again.
          </li>
          <li>
            <strong>Silence</strong>{" "}— check the preset&apos;s input block. One was set to Variax
            and made no sound on a normal guitar.
          </li>
          <li>
            <strong>⚠ on a change</strong>{" "}— the Output block can&apos;t go that high. Lower the
            target or fix the preset.
          </li>
          <li>
            <strong>Input checks warn</strong>{" "}— something is adding gain. Check Mic Mode, then try
            Chrome.
          </li>
          <li>
            <strong>A whole pass sounds off</strong>{" "}— check <em>On the Helix right now</em>.
          </li>
          <li>
            <strong>&ldquo;Found N chords but the preset has M snapshots&rdquo;</strong>{" "}— a missed
            or doubled chord in an uploaded .wav. Record it again.
          </li>
        </ul>
      </Section>

      <Section title="Why it works this way">
        <p>
          <strong>LUFS</strong>{" "}measures how loud something <em>sounds</em>, weighting frequencies
          the way ears do — unlike a peak meter, where a compressed lead and a clean tone can read
          the same and sound nothing alike. Numbers are negative; closer to 0 is louder.
        </p>
        <p>
          And it&apos;s measured from real playing, not calculated from the preset file. Amps are
          non-linear: an older version of this app worked it out from the file and called a gig
          level while one song sat 30 dB below another.
        </p>
        <p>
          It measures <em>you</em>{" "}playing through the patch, so keep the playing the same — a
          chord on one snapshot and a single note on the next will read as a level difference.
          Don&apos;t touch the Helix volume knob or global settings mid-pass.
        </p>
      </Section>

    </main>
    </Shell>
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
        measured region — just after the attack
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
    ["solo", 300, 5, true],
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
