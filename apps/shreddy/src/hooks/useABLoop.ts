import { useState, useCallback } from "react";

interface ABLoop {
  a: number;
  b: number;
}

export function useABLoop() {
  const [abLoop, setAbLoop] = useState<ABLoop | null>(null);
  const [settingAB, setSettingAB] = useState<"idle" | "a_set">("idle");
  const [abPointA, setAbPointA] = useState(0);

  const handleABLoop = useCallback((currentTime: number) => {
    if (settingAB === "idle") {
      setAbPointA(currentTime);
      setSettingAB("a_set");
    } else if (settingAB === "a_set") {
      const a = Math.min(abPointA, currentTime);
      const b = Math.max(abPointA, currentTime);
      if (b - a > 0.5) {
        setAbLoop({ a, b });
      }
      setSettingAB("idle");
    }
  }, [settingAB, abPointA]);

  const clearABLoop = useCallback(() => {
    setAbLoop(null);
    setSettingAB("idle");
  }, []);

  return {
    abLoop,
    settingAB,
    abPointA,
    handleABLoop,
    clearABLoop,
  };
}
