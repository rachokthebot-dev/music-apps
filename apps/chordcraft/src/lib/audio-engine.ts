import * as Tone from "tone";
import { type Chord, chordToNotes } from "./music-theory";

let synth: Tone.PolySynth | null = null;
let bassSynth: Tone.MonoSynth | null = null;
let kick: Tone.MembraneSynth | null = null;
let snare: Tone.NoiseSynth | null = null;
let hihat: Tone.NoiseSynth | null = null;

let scheduledEvents: number[] = [];
let isPlaying = false;

// Volume nodes
let chordVolume: Tone.Volume | null = null;
let bassVolume: Tone.Volume | null = null;
let drumVolume: Tone.Volume | null = null;

// Track toggles
let bassEnabled = true;
let drumsEnabled = true;

// iOS audio unlock state
let iosUnlocked = false;

function getChordVolume(): Tone.Volume {
  if (!chordVolume) {
    chordVolume = new Tone.Volume(-8).toDestination();
  }
  return chordVolume;
}

function getBassVolume(): Tone.Volume {
  if (!bassVolume) {
    bassVolume = new Tone.Volume(-6).toDestination();
  }
  return bassVolume;
}

function getDrumVolume(): Tone.Volume {
  if (!drumVolume) {
    drumVolume = new Tone.Volume(-10).toDestination();
  }
  return drumVolume;
}

function getSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.4,
        release: 0.8,
      },
    }).connect(getChordVolume());
    synth.maxPolyphony = 8;
  }
  return synth;
}

function getBassSynth(): Tone.MonoSynth {
  if (!bassSynth) {
    bassSynth = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.05,
        decay: 0.3,
        sustain: 0.6,
        release: 0.4,
      },
      filterEnvelope: {
        attack: 0.06,
        decay: 0.2,
        sustain: 0.5,
        release: 0.2,
        baseFrequency: 200,
        octaves: 2,
      },
    }).connect(getBassVolume());
  }
  return bassSynth;
}

function getKick(): Tone.MembraneSynth {
  if (!kick) {
    kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      oscillator: { type: "sine" },
      envelope: {
        attack: 0.001,
        decay: 0.3,
        sustain: 0,
        release: 0.1,
      },
    }).connect(getDrumVolume());
  }
  return kick;
}

function getSnare(): Tone.NoiseSynth {
  if (!snare) {
    snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: {
        attack: 0.001,
        decay: 0.15,
        sustain: 0,
        release: 0.05,
      },
    }).connect(getDrumVolume());
    snare.volume.value = -8;
  }
  return snare;
}

function getHihat(): Tone.NoiseSynth {
  if (!hihat) {
    hihat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: {
        attack: 0.001,
        decay: 0.05,
        sustain: 0,
        release: 0.01,
      },
    }).connect(getDrumVolume());
    hihat.volume.value = -18;
  }
  return hihat;
}

// On iOS, Web Audio uses the "ambient" audio session by default, which respects
// the silent mode switch and produces no audible output. Playing an HTML5 <audio>
// element forces iOS to switch to "playback" mode, making Web Audio audible.
// A tiny base64-encoded silent MP3 is used as the source.
const SILENT_MP3 = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqnAAAAAAD/+1DEAAAHAAGf9AAAIVABL/AAAAEAAAAACQAAABMQABhGFjAIBg+D5/KAgGP5QEAwfP/E4Pn/+XB9/ygIBj////////////lAQDB8/Lg+/5QEAx/KAgGH4fB8/lAQDP////8uD58HwfKAgGD4Pg+D5//+UHwfB8/ygfB8oP///////lAQDH8oCAdB8Hw==";

function unlockiOS(): void {
  if (iosUnlocked) return;
  try {
    // 1. Play a silent HTML5 audio element to switch iOS audio session to "playback"
    const audio = new Audio(SILENT_MP3);
    audio.setAttribute("playsinline", "");
    audio.play().catch(() => {});

    // 2. Also resume the Web Audio context
    const ctx = Tone.getContext().rawContext as AudioContext;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    iosUnlocked = true;
  } catch {
    // ignore
  }
}

export async function ensureAudioContext(): Promise<void> {
  // Unlock iOS audio first (synchronous, must be in user gesture call stack)
  unlockiOS();
  // Then start Tone.js
  await Tone.start();
}

export async function playChord(chord: Chord, duration: string = "2n"): Promise<void> {
  await ensureAudioContext();
  const s = getSynth();
  const notes = chordToNotes(chord.root, chord.quality, 3);
  s.triggerAttackRelease(notes, duration);
}

export interface PlaybackCallbacks {
  onChordChange?: (index: number) => void;
  onStop?: () => void;
}

export async function playProgression(
  chords: Chord[],
  bpm: number,
  loop: boolean,
  callbacks?: PlaybackCallbacks
): Promise<void> {
  await ensureAudioContext();
  stopPlayback();

  const s = getSynth();
  const bass = getBassSynth();
  const kickDrum = getKick();
  const snareDrum = getSnare();
  const hihatDrum = getHihat();

  Tone.getTransport().bpm.value = bpm;
  isPlaying = true;

  const totalBars = chords.length;

  chords.forEach((chord, i) => {
    const notes = chordToNotes(chord.root, chord.quality, 3);

    // Chord synth — plays on beat 1 of each bar
    const chordEventId = Tone.getTransport().schedule((time) => {
      s.triggerAttackRelease(notes, "1n", time);
      Tone.getDraw().schedule(() => {
        callbacks?.onChordChange?.(i);
      }, time);
    }, `${i}:0:0`);
    scheduledEvents.push(chordEventId);

    // Bass — plays root on beats 1 and 3
    if (bassEnabled) {
      const bassNote = `${chord.root}2`;
      const bass1 = Tone.getTransport().schedule((time) => {
        bass.triggerAttackRelease(bassNote, "4n", time);
      }, `${i}:0:0`);
      scheduledEvents.push(bass1);

      const bass3 = Tone.getTransport().schedule((time) => {
        bass.triggerAttackRelease(bassNote, "4n", time);
      }, `${i}:2:0`);
      scheduledEvents.push(bass3);
    }

    // Drums
    if (drumsEnabled) {
      // 4 beats per bar
      for (let beat = 0; beat < 4; beat++) {
        // Kick on beats 1 and 3
        if (beat === 0 || beat === 2) {
          const kickId = Tone.getTransport().schedule((time) => {
            kickDrum.triggerAttackRelease("C1", "8n", time);
          }, `${i}:${beat}:0`);
          scheduledEvents.push(kickId);
        }

        // Snare on beats 2 and 4
        if (beat === 1 || beat === 3) {
          const snareId = Tone.getTransport().schedule((time) => {
            snareDrum.triggerAttackRelease("8n", time);
          }, `${i}:${beat}:0`);
          scheduledEvents.push(snareId);
        }

        // Hi-hat on every 8th note (2 per beat)
        for (let eighth = 0; eighth < 2; eighth++) {
          const hhId = Tone.getTransport().schedule((time) => {
            hihatDrum.triggerAttackRelease("32n", time);
          }, `${i}:${beat}:${eighth * 2}`);
          scheduledEvents.push(hhId);
        }
      }
    }
  });

  if (loop) {
    Tone.getTransport().loop = true;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = `${totalBars}:0:0`;
  } else {
    Tone.getTransport().loop = false;
    const stopId = Tone.getTransport().schedule(() => {
      Tone.getDraw().schedule(() => {
        stopPlayback();
        callbacks?.onStop?.();
      }, Tone.now());
    }, `${totalBars}:0:0`);
    scheduledEvents.push(stopId);
  }

  Tone.getTransport().position = 0;
  Tone.getTransport().start();
}

export function stopPlayback(): void {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  scheduledEvents = [];
  isPlaying = false;
  synth?.releaseAll();
}

export function getIsPlaying(): boolean {
  return isPlaying;
}

export function setTempo(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

// Volume controls (dB values)
export function setChordVolume(db: number): void {
  getChordVolume().volume.value = db;
}

export function setBassVolume(db: number): void {
  getBassVolume().volume.value = db;
}

export function setDrumVolume(db: number): void {
  getDrumVolume().volume.value = db;
}

export function setBassEnabled(enabled: boolean): void {
  bassEnabled = enabled;
}

export function setDrumsEnabled(enabled: boolean): void {
  drumsEnabled = enabled;
}

export function getBassEnabled(): boolean {
  return bassEnabled;
}

export function getDrumsEnabled(): boolean {
  return drumsEnabled;
}

// Play a progression once (no loop) and return a promise that resolves when done.
// Used for ear training — plays chords only (no bass/drums) by default.
export async function playProgressionOnce(
  chords: Chord[],
  bpm: number,
  callbacks?: PlaybackCallbacks
): Promise<void> {
  await ensureAudioContext();
  stopPlayback();

  const s = getSynth();
  Tone.getTransport().bpm.value = bpm;
  Tone.getTransport().loop = false;
  isPlaying = true;

  const totalBars = chords.length;

  return new Promise<void>((resolve) => {
    chords.forEach((chord, i) => {
      const notes = chordToNotes(chord.root, chord.quality, 3);

      const chordEventId = Tone.getTransport().schedule((time) => {
        s.triggerAttackRelease(notes, "1n", time);
        Tone.getDraw().schedule(() => {
          callbacks?.onChordChange?.(i);
        }, time);
      }, `${i}:0:0`);
      scheduledEvents.push(chordEventId);
    });

    // Schedule stop at the end
    const stopId = Tone.getTransport().schedule(() => {
      Tone.getDraw().schedule(() => {
        stopPlayback();
        callbacks?.onStop?.();
        resolve();
      }, Tone.now());
    }, `${totalBars}:0:0`);
    scheduledEvents.push(stopId);

    Tone.getTransport().position = 0;
    Tone.getTransport().start();
  });
}
