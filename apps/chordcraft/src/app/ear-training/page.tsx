"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Play, SkipForward, Headphones, Music, ChevronUp, ChevronDown, Volume2 } from "lucide-react";
import { AppSwitcher } from "@music-apps/shared/app-switcher";
import { progressions, type Progression } from "@/lib/progressions";
import { getProgressionInKey, ALL_KEYS, type Chord } from "@/lib/music-theory";
import { playProgressionOnce, playChord, ensureAudioContext, stopPlayback } from "@/lib/audio-engine";
import { getProgressionInKey as getRootChord } from "@/lib/music-theory";
import {
  ALL_INTERVALS,
  type Interval,
  type IntervalDifficulty,
  getIntervalsForDifficulty,
  getRandomInterval,
  getRandomRootNote,
  playInterval,
  generateIntervalOptions,
} from "@/lib/intervals";

// ---------- Types ----------

type Mode = "progression" | "interval";
type ProgressionDifficulty = "easy" | "medium" | "hard";

interface ProgressionQuestion {
  progression: Progression;
  key: string;
  chords: Chord[];
  options: Progression[];
  bpm: number;
}

interface IntervalQuestion {
  interval: Interval;
  rootNote: string;
  options: Interval[];
}

// ---------- Helpers ----------

const EASY_KEYS = ["C", "G", "D", "A"];

function getRandomKey(difficulty: ProgressionDifficulty): string {
  if (difficulty === "easy") {
    return EASY_KEYS[Math.floor(Math.random() * EASY_KEYS.length)];
  }
  return ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
}

function getBpmForDifficulty(difficulty: ProgressionDifficulty): number {
  switch (difficulty) {
    case "easy": return 90;
    case "medium": return 110;
    case "hard": return 140;
  }
}

function getProgressionsForDifficulty(difficulty: ProgressionDifficulty): Progression[] {
  switch (difficulty) {
    case "easy":
      return progressions.filter((p) => p.numerals.length <= 3);
    case "medium":
      return progressions.filter((p) => p.numerals.length >= 3 && p.numerals.length <= 4);
    case "hard":
      return progressions.filter((p) => p.numerals.length >= 4);
  }
}

function pickDistractors(correct: Progression, pool: Progression[], count: number): Progression[] {
  const candidates = pool.filter((p) => p.id !== correct.id);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateProgressionQuestion(difficulty: ProgressionDifficulty): ProgressionQuestion {
  const pool = getProgressionsForDifficulty(difficulty);
  const fallbackPool = pool.length >= 4 ? pool : progressions;
  const progression = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  const key = getRandomKey(difficulty);
  const chords = getProgressionInKey(progression.numerals, key, "basic");
  const bpm = getBpmForDifficulty(difficulty);

  const distractors = pickDistractors(progression, fallbackPool, 3);
  const options = [progression, ...distractors].sort(() => Math.random() - 0.5);

  return { progression, key, chords, options, bpm };
}

function generateIntervalQuestion(difficulty: IntervalDifficulty): IntervalQuestion {
  const interval = getRandomInterval(difficulty);
  const rootNote = getRandomRootNote();
  const options = generateIntervalOptions(interval, difficulty, 4);
  return { interval, rootNote, options };
}

// ---------- Component ----------

export default function EarTrainingPage() {
  const [mode, setMode] = useState<Mode>("progression");
  const [progDifficulty, setProgDifficulty] = useState<ProgressionDifficulty>("easy");
  const [intDifficulty, setIntDifficulty] = useState<IntervalDifficulty>("easy");

  // Progression state
  const [progQuestion, setProgQuestion] = useState<ProgressionQuestion | null>(null);
  const [progAnswer, setProgAnswer] = useState<string | null>(null);
  const [progScore, setProgScore] = useState({ correct: 0, total: 0 });
  const [progStreak, setProgStreak] = useState(0);
  const [progIsPlaying, setProgIsPlaying] = useState(false);

  // Interval state
  const [intQuestion, setIntQuestion] = useState<IntervalQuestion | null>(null);
  const [intAnswer, setIntAnswer] = useState<number | null>(null); // semitones of chosen answer
  const [intScore, setIntScore] = useState({ correct: 0, total: 0 });
  const [intStreak, setIntStreak] = useState(0);

  // Difficulty suggestion
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track consecutive for suggestion logic
  const consecutiveCorrectRef = useRef(0);
  const consecutiveWrongRef = useRef(0);

  const showSuggestion = useCallback((msg: string) => {
    setSuggestion(msg);
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = setTimeout(() => setSuggestion(null), 4000);
  }, []);

  const checkStreakSuggestion = useCallback(
    (correct: boolean, currentDifficulty: string) => {
      if (correct) {
        consecutiveCorrectRef.current++;
        consecutiveWrongRef.current = 0;
        if (consecutiveCorrectRef.current >= 5 && currentDifficulty !== "hard") {
          showSuggestion("You're on fire! Consider bumping up the difficulty.");
          consecutiveCorrectRef.current = 0;
        }
      } else {
        consecutiveWrongRef.current++;
        consecutiveCorrectRef.current = 0;
        if (consecutiveWrongRef.current >= 3 && currentDifficulty !== "easy") {
          showSuggestion("Try turning down the difficulty for more practice.");
          consecutiveWrongRef.current = 0;
        }
      }
    },
    [showSuggestion]
  );

  // ---------- Progression Mode ----------

  const newProgQuestion = useCallback(() => {
    stopPlayback();
    setProgIsPlaying(false);
    setProgAnswer(null);
    const q = generateProgressionQuestion(progDifficulty);
    setProgQuestion(q);
  }, [progDifficulty]);

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

  // Generate first question on mount / difficulty change
  useEffect(() => {
    newProgQuestion();
    // Reset scores on difficulty change
    setProgScore({ correct: 0, total: 0 });
    setProgStreak(0);
    consecutiveCorrectRef.current = 0;
    consecutiveWrongRef.current = 0;
  }, [progDifficulty]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayProgression = useCallback(async () => {
    if (!progQuestion || progIsPlaying) return;
    await ensureAudioContext();
    setProgIsPlaying(true);
    await playProgressionOnce(progQuestion.chords, progQuestion.bpm, {
      onStop: () => setProgIsPlaying(false),
    });
  }, [progQuestion, progIsPlaying]);

  const handlePlayRoot = useCallback(async () => {
    if (!progQuestion) return;
    await ensureAudioContext();
    const rootChord = getRootChord(["I"], progQuestion.key, "basic")[0];
    playChord(rootChord, "2n");
  }, [progQuestion]);

  const handleProgAnswer = useCallback(
    (chosenId: string) => {
      if (progAnswer !== null || !progQuestion) return;
      setProgAnswer(chosenId);
      const isCorrect = chosenId === progQuestion.progression.id;
      setProgScore((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));
      if (isCorrect) {
        setProgStreak((s) => s + 1);
      } else {
        setProgStreak(0);
      }
      checkStreakSuggestion(isCorrect, progDifficulty);
    },
    [progAnswer, progQuestion, progDifficulty, checkStreakSuggestion]
  );

  // ---------- Interval Mode ----------

  const newIntQuestion = useCallback(() => {
    setIntAnswer(null);
    const q = generateIntervalQuestion(intDifficulty);
    setIntQuestion(q);
  }, [intDifficulty]);

  useEffect(() => {
    newIntQuestion();
    setIntScore({ correct: 0, total: 0 });
    setIntStreak(0);
    consecutiveCorrectRef.current = 0;
    consecutiveWrongRef.current = 0;
  }, [intDifficulty]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayInterval = useCallback(async () => {
    if (!intQuestion) return;
    await playInterval(intQuestion.rootNote, intQuestion.interval.semitones);
  }, [intQuestion]);

  const handleIntAnswer = useCallback(
    (semitones: number) => {
      if (intAnswer !== null || !intQuestion) return;
      setIntAnswer(semitones);
      const isCorrect = semitones === intQuestion.interval.semitones;
      setIntScore((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));
      if (isCorrect) {
        setIntStreak((s) => s + 1);
      } else {
        setIntStreak(0);
      }
      checkStreakSuggestion(isCorrect, intDifficulty);
    },
    [intAnswer, intQuestion, intDifficulty, checkStreakSuggestion]
  );

  // ---------- Render ----------

  const difficultyLabels = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  };

  const difficultyDescriptions: Record<string, Record<string, string>> = {
    progression: {
      easy: "2-3 chord progressions, common keys",
      medium: "3-4 chord progressions, any key",
      hard: "4+ chord progressions, any key, faster tempo",
    },
    interval: {
      easy: "P4, P5, P8, M3, m3",
      medium: "Adds m2, M2, m7, M7",
      hard: "All 12 intervals",
    },
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <header className="border-b border-border px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Headphones className="w-6 h-6 md:w-7 md:h-7 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Ear Training</h1>
        </div>
        <AppSwitcher currentAppId="chordcraft" />
      </header>

      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Mode tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setMode("progression")}
            className={`flex-1 py-3 md:py-4 text-sm md:text-base font-medium text-center transition-colors ${
              mode === "progression"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Music className="w-4 h-4 md:w-5 md:h-5 inline mr-1.5 -mt-0.5" />
            Progression Recognition
          </button>
          <button
            onClick={() => setMode("interval")}
            className={`flex-1 py-3 md:py-4 text-sm md:text-base font-medium text-center transition-colors ${
              mode === "interval"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Volume2 className="w-4 h-4 md:w-5 md:h-5 inline mr-1.5 -mt-0.5" />
            Interval Training
          </button>
        </div>

        <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">
          {/* Difficulty suggestion banner */}
          {suggestion && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm text-center animate-in fade-in duration-300">
              {suggestion}
            </div>
          )}

          {mode === "progression" ? (
            <ProgressionMode
              question={progQuestion}
              answer={progAnswer}
              score={progScore}
              streak={progStreak}
              isPlaying={progIsPlaying}
              difficulty={progDifficulty}
              difficultyLabels={difficultyLabels}
              difficultyDescription={difficultyDescriptions.progression[progDifficulty]}
              onSetDifficulty={setProgDifficulty}
              onPlay={handlePlayProgression}
              onPlayRoot={handlePlayRoot}
              onAnswer={handleProgAnswer}
              onNext={newProgQuestion}
            />
          ) : (
            <IntervalMode
              question={intQuestion}
              answer={intAnswer}
              score={intScore}
              streak={intStreak}
              difficulty={intDifficulty}
              difficultyLabels={difficultyLabels}
              difficultyDescription={difficultyDescriptions.interval[intDifficulty]}
              onSetDifficulty={setIntDifficulty}
              onPlay={handlePlayInterval}
              onAnswer={handleIntAnswer}
              onNext={newIntQuestion}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ---------- Progression Mode Component ----------

function ProgressionMode({
  question,
  answer,
  score,
  streak,
  isPlaying,
  difficulty,
  difficultyLabels,
  difficultyDescription,
  onSetDifficulty,
  onPlay,
  onPlayRoot,
  onAnswer,
  onNext,
}: {
  question: ProgressionQuestion | null;
  answer: string | null;
  score: { correct: number; total: number };
  streak: number;
  isPlaying: boolean;
  difficulty: ProgressionDifficulty;
  difficultyLabels: Record<string, string>;
  difficultyDescription: string;
  onSetDifficulty: (d: ProgressionDifficulty) => void;
  onPlay: () => void;
  onPlayRoot: () => void;
  onAnswer: (id: string) => void;
  onNext: () => void;
}) {
  if (!question) return null;

  const answered = answer !== null;
  const isCorrect = answer === question.progression.id;

  return (
    <div className="space-y-6">
      {/* Difficulty & Score row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-secondary rounded-lg p-0.5">
          {(["easy", "medium", "hard"] as ProgressionDifficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => onSetDifficulty(d)}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                difficulty === d
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-secondary-foreground"
              }`}
            >
              {difficultyLabels[d]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-sm">
          <ScoreDisplay correct={score.correct} total={score.total} />
          {streak > 0 && <StreakBadge streak={streak} />}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{difficultyDescription}</p>

      {/* Play controls */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Listen to the progression and identify it
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onPlay}
            disabled={isPlaying}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all ${
              isPlaying
                ? "bg-primary/20 text-primary cursor-not-allowed animate-pulse"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
            }`}
          >
            <Play className="w-5 h-5 md:w-6 md:h-6" />
            {isPlaying ? "Playing..." : "Play"}
          </button>

          <button
            onClick={onPlayRoot}
            disabled={isPlaying}
            className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm bg-secondary text-secondary-foreground hover:bg-accent transition-colors active:scale-95"
            title="Play the root chord to establish the key"
          >
            <Music className="w-4 h-4" />
            Root
          </button>

          {answered && (
            <button
              onClick={onPlay}
              disabled={isPlaying}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm bg-secondary text-secondary-foreground hover:bg-accent transition-colors active:scale-95"
            >
              <Play className="w-4 h-4" />
              Replay
            </button>
          )}
        </div>

        {/* Key hint (shown after answering) */}
        {answered && (
          <p className="text-xs text-muted-foreground">
            Key: {question.key} | BPM: {question.bpm}
          </p>
        )}
      </div>

      {/* Multiple choice options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {question.options.map((opt) => {
          const isChosen = answer === opt.id;
          const isCorrectOption = opt.id === question.progression.id;
          let bgClass = "bg-card border-border hover:border-muted-foreground/40";

          if (answered) {
            if (isCorrectOption) {
              bgClass = "bg-green-500/15 border-green-500/50 text-green-300";
            } else if (isChosen && !isCorrectOption) {
              bgClass = "bg-red-500/15 border-red-500/50 text-red-300";
            } else {
              bgClass = "bg-card/50 border-border/50 opacity-50";
            }
          }

          return (
            <button
              key={opt.id}
              onClick={() => onAnswer(opt.id)}
              disabled={answered}
              className={`flex flex-col items-start p-4 md:p-5 rounded-xl border-2 transition-all ${bgClass} ${
                !answered ? "active:scale-[0.98] cursor-pointer" : "cursor-default"
              }`}
            >
              <span className="font-semibold text-sm">{opt.name}</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                {opt.numerals.join(" - ")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Result feedback */}
      {answered && (
        <div className="flex flex-col items-center gap-4">
          <div
            className={`text-lg font-bold ${
              isCorrect ? "text-green-400" : "text-red-400"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </div>
          {!isCorrect && (
            <p className="text-sm text-muted-foreground">
              The answer was{" "}
              <span className="font-semibold text-foreground">
                {question.progression.name}
              </span>{" "}
              ({question.progression.numerals.join(" - ")})
            </p>
          )}

          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
          >
            <SkipForward className="w-4 h-4" />
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Interval Mode Component ----------

function IntervalMode({
  question,
  answer,
  score,
  streak,
  difficulty,
  difficultyLabels,
  difficultyDescription,
  onSetDifficulty,
  onPlay,
  onAnswer,
  onNext,
}: {
  question: IntervalQuestion | null;
  answer: number | null;
  score: { correct: number; total: number };
  streak: number;
  difficulty: IntervalDifficulty;
  difficultyLabels: Record<string, string>;
  difficultyDescription: string;
  onSetDifficulty: (d: IntervalDifficulty) => void;
  onPlay: () => void;
  onAnswer: (semitones: number) => void;
  onNext: () => void;
}) {
  if (!question) return null;

  const answered = answer !== null;
  const isCorrect = answer === question.interval.semitones;

  return (
    <div className="space-y-6">
      {/* Difficulty & Score row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-secondary rounded-lg p-0.5">
          {(["easy", "medium", "hard"] as IntervalDifficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => onSetDifficulty(d)}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                difficulty === d
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-secondary-foreground"
              }`}
            >
              {difficultyLabels[d]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-sm">
          <ScoreDisplay correct={score.correct} total={score.total} />
          {streak > 0 && <StreakBadge streak={streak} />}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{difficultyDescription}</p>

      {/* Play controls */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Listen to two notes and identify the interval
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onPlay}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
          >
            <Play className="w-5 h-5 md:w-6 md:h-6" />
            Play Interval
          </button>
        </div>
      </div>

      {/* Multiple choice options */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((opt) => {
          const isChosen = answer === opt.semitones;
          const isCorrectOption = opt.semitones === question.interval.semitones;
          let bgClass = "bg-card border-border hover:border-muted-foreground/40";

          if (answered) {
            if (isCorrectOption) {
              bgClass = "bg-green-500/15 border-green-500/50 text-green-300";
            } else if (isChosen && !isCorrectOption) {
              bgClass = "bg-red-500/15 border-red-500/50 text-red-300";
            } else {
              bgClass = "bg-card/50 border-border/50 opacity-50";
            }
          }

          return (
            <button
              key={opt.semitones}
              onClick={() => onAnswer(opt.semitones)}
              disabled={answered}
              className={`flex flex-col items-center p-4 md:p-5 rounded-xl border-2 transition-all ${bgClass} ${
                !answered ? "active:scale-[0.98] cursor-pointer" : "cursor-default"
              }`}
            >
              <span className="font-semibold text-sm">{opt.name}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{opt.shortName}</span>
            </button>
          );
        })}
      </div>

      {/* Result feedback */}
      {answered && (
        <div className="flex flex-col items-center gap-4">
          <div
            className={`text-lg font-bold ${
              isCorrect ? "text-green-400" : "text-red-400"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{question.interval.name}</span>{" "}
              <span className="text-muted-foreground">
                ({question.interval.shortName})
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {question.interval.semitones} semitone{question.interval.semitones !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
          >
            <SkipForward className="w-4 h-4" />
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Shared Components ----------

function ScoreDisplay({ correct, total }: { correct: number; total: number }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Score:</span>
      <span className="font-bold">
        {correct}/{total}
      </span>
      {total > 0 && (
        <span
          className={`text-xs font-medium ${
            pct >= 70 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"
          }`}
        >
          ({pct}%)
        </span>
      )}
    </div>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  return (
    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium">
      <span>{streak}</span>
      <span>streak</span>
    </div>
  );
}
