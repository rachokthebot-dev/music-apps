"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Square, Music, ChevronDown, Guitar, Shuffle, SkipForward, Volume2, Drum } from "lucide-react";
import { progressions, allGenres, type Progression } from "@/lib/progressions";
import { getProgressionInKey, ALL_KEYS, type Chord, type ComplexityLevel } from "@/lib/music-theory";
import {
  playProgression,
  stopPlayback,
  playChord,
  ensureAudioContext,
  setTempo,
  setBassEnabled,
  setDrumsEnabled,
  getBassEnabled,
  getDrumsEnabled,
  setChordVolume,
  setBassVolume,
  setDrumVolume,
} from "@/lib/audio-engine";
import { ChordDiagram } from "@/components/chord-diagram";
import { getVoicings } from "@/lib/chord-voicings";
import { usePracticeStats } from "@/hooks/usePracticeStats";

export default function Home() {
  const [selectedProgression, setSelectedProgression] = useState<Progression>(progressions[0]);
  const [selectedKey, setSelectedKey] = useState("C");
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeChordIndex, setActiveChordIndex] = useState<number>(-1);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [audioReady, setAudioReady] = useState(false);
  const [complexityLevel, setComplexityLevel] = useState<ComplexityLevel>("basic");
  const [expandedChordIndex, setExpandedChordIndex] = useState<number | null>(null);
  const [shuffleMode, setShuffleMode] = useState(false);
  const [bassOn, setBassOn] = useState(true);
  const [drumsOn, setDrumsOn] = useState(true);
  const [chordVol, setChordVol] = useState(-8);
  const [bassVol, setBassVol] = useState(-6);
  const [drumVol, setDrumVol] = useState(-10);
  const bpmRef = useRef(bpm);

  const { startSession, endSession, recordActivity } = usePracticeStats();

  useEffect(() => {
    bpmRef.current = bpm;
    if (isPlaying) {
      setTempo(bpm);
    }
  }, [bpm, isPlaying]);

  const chords = getProgressionInKey(selectedProgression.numerals, selectedKey, complexityLevel);

  // Genre filtering: multi-select
  const filteredProgressions =
    selectedGenres.size > 0
      ? progressions.filter((p) => p.genres.some((g) => selectedGenres.has(g)))
      : progressions;

  // Genre counts
  const genreCounts = allGenres.reduce<Record<string, number>>((acc, genre) => {
    acc[genre] = progressions.filter((p) => p.genres.includes(genre)).length;
    return acc;
  }, {});

  const handleStartAudio = useCallback(async () => {
    await ensureAudioContext();
    setAudioReady(true);
  }, []);

  const handlePlay = useCallback(async () => {
    if (!audioReady) {
      await handleStartAudio();
    }

    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      setActiveChordIndex(-1);
      endSession();
      return;
    }

    // Sync toggle state before playing
    setBassEnabled(bassOn);
    setDrumsEnabled(drumsOn);

    setIsPlaying(true);
    setActiveChordIndex(0);

    startSession(selectedProgression.id, selectedKey, bpmRef.current, complexityLevel);

    await playProgression(chords, bpmRef.current, true, {
      onChordChange: (index) => {
        setActiveChordIndex(index);
        recordActivity();
      },
      onStop: () => {
        setIsPlaying(false);
        setActiveChordIndex(-1);
        endSession();
      },
    });
  }, [audioReady, isPlaying, chords, handleStartAudio, bassOn, drumsOn, selectedProgression.id, selectedKey, complexityLevel, startSession, endSession, recordActivity]);

  const handleChordTap = useCallback(
    async (chord: Chord, index: number) => {
      if (!audioReady) {
        await handleStartAudio();
      }
      playChord(chord);
      setExpandedChordIndex((prev) => (prev === index ? null : index));
    },
    [audioReady, handleStartAudio]
  );

  const handleProgressionSelect = useCallback(
    (prog: Progression) => {
      if (isPlaying) {
        stopPlayback();
        setIsPlaying(false);
        setActiveChordIndex(-1);
        endSession();
      }
      setSelectedProgression(prog);
      setExpandedChordIndex(null);
    },
    [isPlaying, endSession]
  );

  const handleGenreToggle = useCallback((genre: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) {
        next.delete(genre);
      } else {
        next.add(genre);
      }
      return next;
    });
  }, []);

  const handleClearGenres = useCallback(() => {
    setSelectedGenres(new Set());
  }, []);

  // Shuffle mode
  const pickRandomProgression = useCallback(() => {
    if (filteredProgressions.length === 0) return;
    const candidates = filteredProgressions.filter((p) => p.id !== selectedProgression.id);
    const pool = candidates.length > 0 ? candidates : filteredProgressions;
    const randomProg = pool[Math.floor(Math.random() * pool.length)];

    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      setActiveChordIndex(-1);
      endSession();
    }
    setSelectedProgression(randomProg);
    setExpandedChordIndex(null);
  }, [filteredProgressions, selectedProgression.id, isPlaying, endSession]);

  const handleShuffleToggle = useCallback(() => {
    if (!shuffleMode) {
      setShuffleMode(true);
      pickRandomProgression();
    } else {
      setShuffleMode(false);
    }
  }, [shuffleMode, pickRandomProgression]);

  // Volume handlers
  const handleChordVolChange = useCallback((val: number) => {
    setChordVol(val);
    setChordVolume(val);
  }, []);

  const handleBassVolChange = useCallback((val: number) => {
    setBassVol(val);
    setBassVolume(val);
  }, []);

  const handleDrumVolChange = useCallback((val: number) => {
    setDrumVol(val);
    setDrumVolume(val);
  }, []);

  const handleBassToggle = useCallback(() => {
    const next = !bassOn;
    setBassOn(next);
    setBassEnabled(next);
  }, [bassOn]);

  const handleDrumsToggle = useCallback(() => {
    const next = !drumsOn;
    setDrumsOn(next);
    setDrumsEnabled(next);
  }, [drumsOn]);

  const difficultyColor = {
    beginner: "text-green-400",
    intermediate: "text-yellow-400",
    advanced: "text-red-400",
  };

  const complexityLevels: { value: ComplexityLevel; label: string }[] = [
    { value: "basic", label: "Basic" },
    { value: "intermediate", label: "7ths" },
    { value: "advanced", label: "Extended" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Music className="w-6 h-6 md:w-7 md:h-7 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">ChordCraft</h1>
        </div>
        <span className="text-xs md:text-sm text-muted-foreground">Chord Progression Trainer</span>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar: Progression picker */}
        <aside className="md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-border overflow-y-auto shrink-0 max-h-[40vh] md:max-h-none">
          <div className="p-3">
            {/* Genre filter pills with counts and multi-select */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={handleClearGenres}
                className={`px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors ${
                  selectedGenres.size === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                All ({progressions.length})
              </button>
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => handleGenreToggle(genre)}
                  className={`px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-medium capitalize transition-colors ${
                    selectedGenres.has(genre)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
                >
                  {genre} ({genreCounts[genre]})
                </button>
              ))}
            </div>

            {/* Progression list */}
            <div className="space-y-1">
              {filteredProgressions.map((prog) => (
                <button
                  key={prog.id}
                  onClick={() => handleProgressionSelect(prog)}
                  className={`w-full text-left px-3 py-2.5 md:py-3 rounded-lg transition-colors ${
                    selectedProgression.id === prog.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{prog.name}</span>
                    <span className={`text-[10px] ${difficultyColor[prog.difficulty]}`}>
                      {prog.difficulty}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {prog.numerals.join(" - ")}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Key selector */}
            <div className="relative">
              <select
                value={selectedKey}
                onChange={(e) => {
                  if (isPlaying) {
                    stopPlayback();
                    setIsPlaying(false);
                    setActiveChordIndex(-1);
                    endSession();
                  }
                  setSelectedKey(e.target.value);
                }}
                className="appearance-none bg-secondary text-secondary-foreground pl-3 pr-8 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {ALL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    Key of {k}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Complexity level toggle */}
            <div className="flex bg-secondary rounded-lg p-0.5">
              {complexityLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => {
                    setComplexityLevel(level.value);
                    setExpandedChordIndex(null);
                  }}
                  className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                    complexityLevel === level.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-secondary-foreground"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>

            {/* Tempo control */}
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">BPM</span>
              <input
                type="range"
                min={60}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-24 md:w-32 accent-primary"
              />
              <span className="text-sm font-mono w-8 text-right">{bpm}</span>
            </div>

            {/* Play/Stop */}
            <button
              onClick={handlePlay}
              className={`flex items-center gap-2 px-5 py-2 md:px-6 md:py-3 rounded-lg font-medium text-sm md:text-base transition-colors ${
                isPlaying
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-4 h-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Play
                </>
              )}
            </button>

            {/* Shuffle */}
            <button
              onClick={handleShuffleToggle}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                shuffleMode
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
              title="Shuffle mode"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden sm:inline">Shuffle</span>
            </button>

            {/* Next (only in shuffle mode) */}
            {shuffleMode && (
              <button
                onClick={pickRandomProgression}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                title="Next random progression"
              >
                <SkipForward className="w-4 h-4" />
                <span className="hidden sm:inline">Next</span>
              </button>
            )}
          </div>

          {/* Backing track controls */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
            {/* Bass toggle */}
            <button
              onClick={handleBassToggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                bassOn
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                  : "bg-secondary text-muted-foreground border border-transparent"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              Bass
            </button>

            {/* Drums toggle */}
            <button
              onClick={handleDrumsToggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                drumsOn
                  ? "bg-orange-600/20 text-orange-400 border border-orange-600/30"
                  : "bg-secondary text-muted-foreground border border-transparent"
              }`}
            >
              <Drum className="w-3.5 h-3.5" />
              Drums
            </button>

            {/* Volume sliders */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span>Chords</span>
              <input
                type="range"
                min={-30}
                max={0}
                value={chordVol}
                onChange={(e) => handleChordVolChange(Number(e.target.value))}
                className="w-16 accent-primary"
              />
            </div>
            {bassOn && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Bass</span>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  value={bassVol}
                  onChange={(e) => handleBassVolChange(Number(e.target.value))}
                  className="w-16 accent-blue-400"
                />
              </div>
            )}
            {drumsOn && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Drums</span>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  value={drumVol}
                  onChange={(e) => handleDrumVolChange(Number(e.target.value))}
                  className="w-16 accent-orange-400"
                />
              </div>
            )}
          </div>

          {/* Progression name */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl md:text-3xl font-bold">{selectedProgression.name}</h2>
              {shuffleMode && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-600/20 text-green-400 font-medium">
                  SHUFFLE
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedProgression.numerals.join(" - ")} in {selectedKey}
              {complexityLevel !== "basic" && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-secondary">
                  {complexityLevel === "intermediate" ? "7th chords" : "extended"}
                </span>
              )}
            </p>
          </div>

          {/* Chord display */}
          <div className="flex-1 flex items-start">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 w-full">
              {chords.map((chord, i) => {
                const isExpanded = expandedChordIndex === i;
                const voicings = getVoicings(chord.name);
                const hasVoicings = voicings.length > 0;

                return (
                  <div key={`${chord.name}-${i}`} className="flex flex-col">
                    <button
                      onClick={() => handleChordTap(chord, i)}
                      className={`relative flex flex-col items-center justify-center p-4 md:p-5 rounded-xl border-2 transition-all duration-150 active:scale-95 ${
                        activeChordIndex === i
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 scale-[1.03]"
                          : isExpanded
                          ? "border-primary/50 bg-card"
                          : "border-border bg-card hover:border-muted-foreground/30"
                      }`}
                    >
                      {/* Bar number */}
                      <span className="absolute top-1.5 left-2 text-[10px] text-muted-foreground">
                        {i + 1}
                      </span>
                      {/* Guitar icon hint */}
                      {hasVoicings && (
                        <span className="absolute top-1.5 right-2">
                          <Guitar className="w-3 h-3 text-muted-foreground/50" />
                        </span>
                      )}
                      {/* Numeral */}
                      <span className="text-xs text-muted-foreground mb-1">
                        {selectedProgression.numerals[i]}
                      </span>
                      {/* Chord name */}
                      <span
                        className={`text-lg md:text-xl font-bold ${
                          activeChordIndex === i ? "text-primary" : "text-card-foreground"
                        }`}
                      >
                        {chord.name}
                      </span>
                      {/* Mini chord diagram */}
                      {hasVoicings && !isExpanded && (
                        <div className="mt-2 opacity-70">
                          <ChordDiagram chordName={chord.name} compact />
                        </div>
                      )}
                    </button>

                    {/* Expanded position explorer */}
                    {isExpanded && hasVoicings && (
                      <PositionExplorer chordName={chord.name} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audio init prompt */}
          {!audioReady && (
            <div className="mt-4 text-center">
              <button
                onClick={handleStartAudio}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Tap here or press Play to enable audio
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Position Explorer component -- shows all voicings for a chord
function PositionExplorer({ chordName }: { chordName: string }) {
  const voicings = getVoicings(chordName);
  const [selectedVoicing, setSelectedVoicing] = useState(0);

  if (voicings.length === 0) return null;

  return (
    <div className="mt-2 p-3 rounded-xl border border-border bg-card/80 backdrop-blur">
      <div className="text-xs text-muted-foreground mb-2 font-medium">
        Positions ({voicings.length})
      </div>

      {/* Voicing tabs */}
      {voicings.length > 1 && (
        <div className="flex gap-1 mb-3">
          {voicings.map((v, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedVoicing(idx);
              }}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                selectedVoicing === idx
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-secondary-foreground"
              }`}
            >
              {v.positionLabel || `Pos ${idx + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Selected voicing diagram */}
      <div className="flex flex-col items-center">
        <ChordDiagram chordName={chordName} voicingIndex={selectedVoicing} />
        <span className="text-[10px] text-muted-foreground mt-1">
          {voicings[selectedVoicing]?.positionLabel || "Position"}
        </span>
      </div>
    </div>
  );
}
