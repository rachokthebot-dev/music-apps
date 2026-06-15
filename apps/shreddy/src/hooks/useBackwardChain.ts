"use client";

// R2 Backward Chaining — auto-drill from the end of a section outward.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R2"
//
// Pedagogy: Royer & Sinatra (1994) showed backward chaining works for piano
// scales. Default reps per stage = 5 (lower bound of their 5-10 range).
//
// Composition: builds A-B loop ranges and feeds them to useABLoop's new
// setLoop() setter. The playback layer drives stage completion by calling
// notifyLoopCompleted() when audio crosses the loop's B boundary.
//
// State as a discriminated union (kieran-typescript review §"useBackwardChain"):
// each variant carries only the fields valid in that state.

import { useCallback, useMemo, useReducer } from "react";

export interface UseBackwardChainOptions {
  /** Section's start time in source seconds. */
  sectionStart: number;
  /** Section's end time in source seconds. */
  sectionEnd: number;
  bpm: number;
  /** Time-signature top number — 3 / 4 / 6. */
  beatsPerBar: 3 | 4 | 6;
  /** First stage loops the last N bars from sectionEnd. */
  initialBarsFromEnd: number;
  /** Reps per stage. */
  repsPerStage: number;
  /** When true, advance to next stage automatically after repsLeft reaches 0. */
  autoAdvance: boolean;
}

export interface ChainLoop {
  a: number;
  b: number;
}

export type BackwardChainState =
  | { status: "idle" }
  | {
      status: "running";
      stage: number; // 1-based, monotonic
      barsFromEnd: number;
      loop: ChainLoop;
      repsLeft: number;
    }
  | {
      status: "between-stages";
      completedStage: number;
      nextLoop: ChainLoop;
      nextBarsFromEnd: number;
    }
  | { status: "completed"; totalStages: number };

type Action =
  | { type: "start" }
  | { type: "loop-completed" }
  | { type: "advance" }
  | { type: "reset" };

interface ReducerCtx {
  options: UseBackwardChainOptions;
  totalStages: number;
}

function computeLoopForBars(
  options: UseBackwardChainOptions,
  barsFromEnd: number
): ChainLoop {
  const secPerBar = (60 / options.bpm) * options.beatsPerBar;
  const span = barsFromEnd * secPerBar;
  return {
    a: Math.max(options.sectionStart, options.sectionEnd - span),
    b: options.sectionEnd,
  };
}

function reducer(state: BackwardChainState, action: Action, ctx: ReducerCtx): BackwardChainState {
  const { options, totalStages } = ctx;
  switch (action.type) {
    case "start": {
      const barsFromEnd = options.initialBarsFromEnd;
      return {
        status: "running",
        stage: 1,
        barsFromEnd,
        loop: computeLoopForBars(options, barsFromEnd),
        repsLeft: options.repsPerStage,
      };
    }
    case "loop-completed": {
      if (state.status !== "running") return state;
      const nextReps = state.repsLeft - 1;
      if (nextReps > 0) {
        return { ...state, repsLeft: nextReps };
      }
      // Stage done. Advance immediately if autoAdvance; otherwise sit at between-stages.
      const nextStage = state.stage + 1;
      if (nextStage > totalStages) {
        return { status: "completed", totalStages };
      }
      const nextBars = state.barsFromEnd + 1;
      const nextLoop = computeLoopForBars(options, nextBars);
      if (options.autoAdvance) {
        return {
          status: "running",
          stage: nextStage,
          barsFromEnd: nextBars,
          loop: nextLoop,
          repsLeft: options.repsPerStage,
        };
      }
      return {
        status: "between-stages",
        completedStage: state.stage,
        nextLoop,
        nextBarsFromEnd: nextBars,
      };
    }
    case "advance": {
      if (state.status !== "between-stages") return state;
      return {
        status: "running",
        stage: state.completedStage + 1,
        barsFromEnd: state.nextBarsFromEnd,
        loop: state.nextLoop,
        repsLeft: options.repsPerStage,
      };
    }
    case "reset":
      return { status: "idle" };
  }
}

export function useBackwardChain(options: UseBackwardChainOptions) {
  // Total stages = bars expand from initialBarsFromEnd until they reach the
  // full section length.
  const totalStages = useMemo(() => {
    const secPerBar = (60 / options.bpm) * options.beatsPerBar;
    const sectionBars = Math.floor((options.sectionEnd - options.sectionStart) / secPerBar);
    return Math.max(1, sectionBars - options.initialBarsFromEnd + 1);
  }, [options.bpm, options.beatsPerBar, options.sectionStart, options.sectionEnd, options.initialBarsFromEnd]);

  const ctx: ReducerCtx = { options, totalStages };
  const [state, dispatch] = useReducer(
    (s: BackwardChainState, a: Action) => reducer(s, a, ctx),
    { status: "idle" }
  );

  const start = useCallback(() => dispatch({ type: "start" }), []);
  const notifyLoopCompleted = useCallback(
    () => dispatch({ type: "loop-completed" }),
    []
  );
  const advanceStage = useCallback(() => dispatch({ type: "advance" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return {
    state,
    totalStages,
    start,
    notifyLoopCompleted,
    advanceStage,
    reset,
  };
}
