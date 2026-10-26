"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { PlayIcon, StopIcon, CaretDownIcon, CaretUpIcon, GuitarIcon, ShuffleIcon, SkipForwardIcon, SpeakerHighIcon, MetronomeIcon, TrashIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { progressions, getAllGenres, type Progression } from "@/lib/progressions";
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
import { loadCustomProgressions, addCustomProgression, deleteCustomProgression } from "@/lib/custom-progressions";
import { AddProgressionDialog, AddProgressionButton } from "@/components/add-progression-dialog";
import { SidebarItem, SidebarMenuButton, SidebarSection } from "@music-apps/shared/app-shell";
import { Shell } from "@/components/shell";

export default function Home() {
  const [customProgressions, setCustomProgressions] = useState<Progression[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showChords, setShowChords] = useState(false);
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

  // Load custom progressions from localStorage on mount
  useEffect(() => {
    setCustomProgressions(loadCustomProgressions());
  }, []);

  // Pre-unlock audio on first touch (iOS Safari requires user gesture)
  useEffect(() => {
    const unlock = () => {
      ensureAudioContext();
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("touchend", unlock);
    };
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("touchend", unlock, { passive: true });
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("touchend", unlock);
    };
  }, []);

  const allProgressions = [...progressions, ...customProgressions];
  const allGenres = getAllGenres(allProgressions);

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
      ? allProgressions.filter((p) => p.genres.some((g) => selectedGenres.has(g)))
      : allProgressions;

  // Genre counts
  const genreCounts = allGenres.reduce<Record<string, number>>((acc, genre) => {
    acc[genre] = allProgressions.filter((p) => p.genres.includes(genre)).length;
    return acc;
  }, {});

  const handleAddProgression = useCallback((prog: Progression) => {
    const updated = addCustomProgression(prog);
    setCustomProgressions(updated);
    setSelectedProgression(prog);
  }, []);

  const handleDeleteProgression = useCallback((id: string) => {
    const updated = deleteCustomProgression(id);
    setCustomProgressions(updated);
    // If deleted the selected one, go to first built-in
    setSelectedProgression((prev) => prev.id === id ? progressions[0] : prev);
  }, []);

  const handleStartAudio = useCallback(async () => {
    await ensureAudioContext();
    setAudioReady(true);
  }, []);

  const handlePlay = useCallback(async () => {
    // Always ensure audio context — iOS Safari can suspend it silently
    await ensureAudioContext();
    setAudioReady(true);

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
  }, [isPlaying, chords, bassOn, drumsOn, selectedProgression.id, selectedKey, complexityLevel, startSession, endSession, recordActivity]);

  const handleChordTap = useCallback(
    async (chord: Chord, index: number) => {
      // playChord now calls ensureAudioContext internally
      await playChord(chord);
      setAudioReady(true);
      setExpandedChordIndex((prev) => (prev === index ? null : index));
    },
    []
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
    <Shell
      extra={
        <>
          <SidebarSection label="Genres" />
          <SidebarItem
            active={selectedGenres.size === 0}
            icon={selectedGenres.size === 0 ? <FolderOpenIcon className="size-5" /> : <FolderIcon className="size-5" />}
            label="All progressions"
            count={allProgressions.length}
            onClick={handleClearGenres}
          />
          {allGenres.map((genre) => (
            <SidebarItem
              key={genre}
              active={selectedGenres.has(genre)}
              icon={selectedGenres.has(genre) ? <FolderOpenIcon className="size-5" /> : <FolderIcon className="size-5" />}
              label={genre[0].toUpperCase() + genre.slice(1)}
              count={genreCounts[genre]}
              onClick={() => handleGenreToggle(genre)}
            />
          ))}
        </>
      }
    >
      <main className="max-w-5xl w-full mx-auto px-4 lg:px-8 py-4 lg:py-6">
        <div className="flex items-center gap-1 mb-4 lg:hidden">
          <SidebarMenuButton />
          <h1 className="text-xl font-semibold tracking-tight">ChordCraft</h1>
        </div>
        <div className="flex flex-col">
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
                className="appearance-none h-11 bg-card border border-border text-foreground pl-4 pr-9 rounded-full text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {ALL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    Key of {k}
                  </option>
                ))}
              </select>
              <CaretDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Complexity level toggle */}
            <div className="flex bg-muted rounded-2xl p-1">
              {complexityLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => {
                    setComplexityLevel(level.value);
                    setExpandedChordIndex(null);
                  }}
                  className={`h-9 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ease-spring ${
                    complexityLevel === level.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>

            {/* Tempo control */}
            <div className="h-11 flex items-center gap-2 bg-card border border-border rounded-full px-4">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">BPM</span>
              <input
                type="range"
                min={60}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-24 md:w-32 accent-primary"
              />
              <span className="text-sm font-semibold tabular-nums w-8 text-right">{bpm}</span>
            </div>

            {/* Play/Stop */}
            <button
              onClick={handlePlay}
              className={`relative h-12 flex items-center gap-2 px-6 rounded-full bg-primary text-primary-foreground font-semibold text-sm md:text-base active:scale-95 transition-all duration-200 ease-spring ${
                isPlaying ? "play-pulse" : ""
              }`}
            >
              {isPlaying ? (
                <>
                  <StopIcon className="size-5" weight="fill" /> Stop
                </>
              ) : (
                <>
                  <PlayIcon className="size-5" weight="fill" /> Play
                </>
              )}
            </button>

            {/* Shuffle */}
            <button
              onClick={handleShuffleToggle}
              className={`h-11 flex items-center gap-1.5 px-4 rounded-full text-sm font-semibold active:scale-95 transition-all duration-200 ease-spring ${
                shuffleMode
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
              title="Shuffle mode"
            >
              <ShuffleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Shuffle</span>
            </button>

            {/* Next (only in shuffle mode) */}
            {shuffleMode && (
              <button
                onClick={pickRandomProgression}
                className="h-11 flex items-center gap-1.5 px-4 rounded-full text-sm font-semibold bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all duration-200 ease-spring"
                title="Next random progression"
              >
                <SkipForwardIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Next</span>
              </button>
            )}
          </div>

          {/* Backing track controls */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            {/* Bass toggle */}
            <button
              onClick={handleBassToggle}
              className={`h-11 flex items-center gap-2 px-4 rounded-full font-semibold active:scale-95 transition-all duration-200 ease-spring ${
                bassOn
                  ? "bg-blue-500/15 text-blue-400 border border-transparent"
                  : "bg-card text-muted-foreground border border-border"
              }`}
            >
              <SpeakerHighIcon className="w-4 h-4" />
              Bass
            </button>

            {/* Drums toggle */}
            <button
              onClick={handleDrumsToggle}
              className={`h-11 flex items-center gap-2 px-4 rounded-full font-semibold active:scale-95 transition-all duration-200 ease-spring ${
                drumsOn
                  ? "bg-orange-500/15 text-orange-400 border border-transparent"
                  : "bg-card text-muted-foreground border border-border"
              }`}
            >
              <MetronomeIcon className="w-4 h-4" />
              Drums
            </button>

            {/* Volume sliders — taller track + thumb for finger control */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs font-medium">Chords</span>
              <input
                type="range"
                min={-30}
                max={0}
                value={chordVol}
                onChange={(e) => handleChordVolChange(Number(e.target.value))}
                className="cc-slider w-28 accent-primary"
              />
            </div>
            {bassOn && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs font-medium">Bass</span>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  value={bassVol}
                  onChange={(e) => handleBassVolChange(Number(e.target.value))}
                  className="cc-slider w-28 accent-blue-400"
                />
              </div>
            )}
            {drumsOn && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs font-medium">Drums</span>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  value={drumVol}
                  onChange={(e) => handleDrumVolChange(Number(e.target.value))}
                  className="cc-slider w-28 accent-orange-400"
                />
              </div>
            )}
          </div>

          {/* Progression name */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">{selectedProgression.name}</h2>
              {shuffleMode && (
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                  SHUFFLE
                </span>
              )}
            </div>
            {complexityLevel !== "basic" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {complexityLevel === "intermediate" ? "7th chords" : "extended"}
              </span>
            )}
          </div>

          {/* Chord sequence — always visible, highlights active chord */}
          <div className="flex flex-wrap gap-2 mb-4">
            {chords.map((chord, i) => (
              <button
                key={`seq-${i}`}
                onClick={() => handleChordTap(chord, i)}
                className={`min-w-16 min-h-16 px-5 py-3 rounded-2xl text-base md:text-lg font-semibold transition-all duration-300 ease-spring flex items-center justify-center gap-2 ${
                  activeChordIndex === i
                    ? "bg-loop text-loop-foreground shadow-md scale-105"
                    : "bg-card border border-border text-foreground hover:bg-muted"
                }`}
              >
                <span className={`text-xs ${activeChordIndex === i ? "opacity-70" : "text-muted-foreground"}`}>{selectedProgression.numerals[i]}</span>
                {showChords && chord.name}
              </button>
            ))}
          </div>

          {/* Show/hide chord diagrams toggle */}
          <button
            onClick={() => setShowChords(!showChords)}
            className="h-11 w-fit flex items-center gap-1.5 px-3 -ml-3 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-4"
          >
            <GuitarIcon className="w-4 h-4" />
            {showChords ? "Hide Chords" : "Show Chords"}
            {showChords ? <CaretUpIcon className="w-3.5 h-3.5" /> : <CaretDownIcon className="w-3.5 h-3.5" />}
          </button>

          {/* Chord diagrams — deduplicated, shown on toggle */}
          {showChords && (
            <div className="flex-1 flex items-start">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 w-full">
                {chords
                  .filter((chord, i, arr) => arr.findIndex((c) => c.name === chord.name) === i)
                  .map((chord) => {
                    const voicings = getVoicings(chord.name);
                    const hasVoicings = voicings.length > 0;
                    const chordIndex = chords.findIndex((c) => c.name === chord.name);
                    const isExpanded = expandedChordIndex === chordIndex;

                    return (
                      <div key={chord.name} className="flex flex-col">
                        <button
                          onClick={() => handleChordTap(chord, chordIndex)}
                          className={`relative flex flex-col items-center justify-center p-4 md:p-5 rounded-3xl border bg-card transition-all duration-300 ease-spring active:scale-95 ${
                            isExpanded
                              ? "border-muted-foreground/50"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {hasVoicings && (
                            <span className="absolute top-1.5 right-2">
                              <GuitarIcon className="w-3 h-3 text-muted-foreground/50" />
                            </span>
                          )}
                          <span className="text-lg md:text-xl font-bold text-card-foreground">
                            {chord.name}
                          </span>
                          {hasVoicings && !isExpanded && (
                            <div className="mt-2 opacity-70">
                              <ChordDiagram chordName={chord.name} compact />
                            </div>
                          )}
                        </button>

                        {isExpanded && hasVoicings && (
                          <PositionExplorer chordName={chord.name} />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Audio init prompt */}
          {!audioReady && (
            <div className="mt-4">
              <button
                onClick={handleStartAudio}
                className="w-full h-14 flex items-center justify-center gap-2 rounded-full bg-loop/15 text-loop hover:bg-loop/25 active:scale-[0.99] transition-all duration-200 ease-spring text-base font-semibold"
              >
                <SpeakerHighIcon className="w-5 h-5" />
                Tap to enable audio
              </button>
            </div>
          )}
        </div>

        {/* The progressions in the chosen genres — the list, the way Shreddy
            lists songs. Picking one loads it into the player above. */}
        <div className="flex items-baseline gap-3 mt-10 mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            {selectedGenres.size === 0
              ? "All progressions"
              : [...selectedGenres].map((g) => g[0].toUpperCase() + g.slice(1)).join(", ")}
          </h2>
          <span className="text-sm text-muted-foreground">
            {filteredProgressions.length} {filteredProgressions.length === 1 ? "progression" : "progressions"}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredProgressions.map((prog) => {
            const isCustom = prog.id.startsWith("custom-");
            const selected = selectedProgression.id === prog.id;
            return (
              <div key={prog.id} className="group relative">
                <button
                  onClick={() => {
                    handleProgressionSelect(prog);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`w-full text-left p-4 rounded-3xl border transition-all duration-300 ease-spring active:scale-[0.99] ${
                    selected ? "bg-muted border-muted-foreground/40" : "bg-card border-border hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold truncate">{prog.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {isCustom && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          custom
                        </span>
                      )}
                      <span className={`text-xs font-medium ${difficultyColor[prog.difficulty]}`}>
                        {prog.difficulty}
                      </span>
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{prog.numerals.join(" - ")}</div>
                </button>
                {isCustom && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProgression(prog.id);
                    }}
                    className="absolute right-3 bottom-3 size-9 grid place-items-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                    title="Delete progression"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
          <AddProgressionButton onClick={() => setShowAddDialog(true)} />
        </div>
      </main>

      <AddProgressionDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={handleAddProgression}
      />
    </Shell>
  );
}

// Position Explorer component -- shows all voicings for a chord
function PositionExplorer({ chordName }: { chordName: string }) {
  const voicings = getVoicings(chordName);
  const [selectedVoicing, setSelectedVoicing] = useState(0);

  if (voicings.length === 0) return null;

  return (
    <div className="mt-2 p-3 rounded-3xl border border-border bg-card">
      <div className="text-xs text-muted-foreground mb-2 font-medium">
        Positions ({voicings.length})
      </div>

      {/* Voicing tabs */}
      {voicings.length > 1 && (
        <div className="flex flex-wrap gap-1 p-1 mb-3 rounded-2xl bg-muted">
          {voicings.map((v, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedVoicing(idx);
              }}
              className={`h-8 px-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ease-spring ${
                selectedVoicing === idx
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
