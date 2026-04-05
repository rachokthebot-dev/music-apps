"use client";

import { Disc3, Volume2, Play } from "lucide-react";
import { Label, Slider, Button } from "@music-apps/ui";

interface MetronomePanelProps {
  enabled: boolean;
  onToggle: () => void;
  active: boolean;
  currentBeat: number;
  volume: number;
  onVolumeChange: (v: number) => void;
  baseBpm: number;
  effectiveBpm: number;
  manualBpm: number | null;
  parsedBeatsCount: number;
  playing: boolean;
  standalone: boolean;
  onStandaloneToggle: () => void;
  onTapTempo: () => void;
  onTapSync: () => void;
  onCountInPlay: () => void;
  onResetManualBpm: () => void;
}

export function MetronomePanel({
  enabled,
  onToggle,
  active,
  currentBeat,
  volume,
  onVolumeChange,
  baseBpm,
  effectiveBpm,
  manualBpm,
  parsedBeatsCount,
  playing,
  standalone,
  onStandaloneToggle,
  onTapTempo,
  onTapSync,
  onCountInPlay,
  onResetManualBpm,
}: MetronomePanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Disc3 className={`size-4 ${active ? "animate-spin text-primary" : "text-muted-foreground"}`} />
          <Label className="text-sm font-semibold text-foreground">Metronome</Label>
          {enabled && baseBpm > 0 && (
            <span className="text-xs text-muted-foreground">
              {Math.round(effectiveBpm)} BPM
              {manualBpm && <span className="text-[10px] ml-1">(tap)</span>}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <div className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      {enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`size-3 rounded-full transition-all ${
                  active && currentBeat === i
                    ? i === 0 ? "bg-primary scale-125" : "bg-primary/70 scale-110"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="size-3.5 text-muted-foreground shrink-0" />
            <Slider min={0} max={1} step={0.05} value={[volume]} onValueChange={(v) => onVolumeChange(Array.isArray(v) ? v[0] : v)} className="flex-1" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={onTapTempo}>Tap BPM</Button>
            {parsedBeatsCount === 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={onTapSync}>Sync</Button>
            )}
            {!playing && baseBpm > 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={onCountInPlay}>
                <Play className="size-3" /> Count-in
              </Button>
            )}
            <Button variant={standalone ? "secondary" : "outline"} size="sm" className="text-xs h-7" onClick={onStandaloneToggle}>Solo</Button>
            {manualBpm && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={onResetManualBpm}>Reset BPM</Button>
            )}
          </div>
          {parsedBeatsCount > 0 && (
            <p className="text-[10px] text-muted-foreground/50">Synced to {parsedBeatsCount} detected beats</p>
          )}
        </div>
      )}
    </div>
  );
}
