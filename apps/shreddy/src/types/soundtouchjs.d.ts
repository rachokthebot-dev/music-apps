declare module "soundtouchjs" {
  export class PitchShifter {
    constructor(
      context: AudioContext,
      buffer: AudioBuffer,
      bufferSize: number,
      onEnd?: () => void
    );
    timePlayed: number;
    percentagePlayed: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
    tempo: number;
    duration: number;
    sampleRate: number;
    sourcePosition: number;
    get node(): ScriptProcessorNode;
    connect(toNode: AudioNode): void;
    disconnect(): void;
    on(eventName: string, cb: (detail: unknown) => void): void;
    off(eventName?: string): void;
  }
}
