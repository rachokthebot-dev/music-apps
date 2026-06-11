import { useState, useCallback } from "react";

interface ABLoop {
  a: number;
  b: number;
}

export function useABLoop() {
  const [abLoop, setAbLoop] = useState<ABLoop | null>(null);
  const [pendingA, setPendingA] = useState<number | null>(null);

  const setA = useCallback((currentTime: number) => {
    setPendingA(currentTime);
    setAbLoop(null);
  }, []);

  const setB = useCallback((currentTime: number) => {
    setPendingA((a) => {
      if (a === null || currentTime - a <= 0.5) return a;
      setAbLoop({ a, b: currentTime });
      return null;
    });
  }, []);

  const clearABLoop = useCallback(() => {
    setAbLoop(null);
    setPendingA(null);
  }, []);

  return {
    abLoop,
    pendingA,
    setA,
    setB,
    clearABLoop,
  };
}
