"use client";

import { useState, useCallback } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import type { Progression } from "@/lib/progressions";
import { VALID_NUMERALS } from "@/lib/custom-progressions";

interface AddProgressionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (prog: Progression) => void;
}

const DIFFICULTY_OPTIONS: Progression["difficulty"][] = ["beginner", "intermediate", "advanced"];

export function AddProgressionDialog({ open, onClose, onSave }: AddProgressionDialogProps) {
  const [name, setName] = useState("");
  const [numerals, setNumerals] = useState<string[]>([]);
  const [currentNumeral, setCurrentNumeral] = useState("");
  const [difficulty, setDifficulty] = useState<Progression["difficulty"]>("beginner");
  const [genre, setGenre] = useState("custom");
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setName("");
    setNumerals([]);
    setCurrentNumeral("");
    setDifficulty("beginner");
    setGenre("custom");
    setError("");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const addNumeral = useCallback((numeral: string) => {
    if (numeral.trim()) {
      setNumerals((prev) => [...prev, numeral.trim()]);
      setCurrentNumeral("");
      setError("");
    }
  }, []);

  const removeNumeral = useCallback((index: number) => {
    setNumerals((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      setError("Give your progression a name");
      return;
    }
    if (numerals.length < 2) {
      setError("Add at least 2 chords");
      return;
    }

    const prog: Progression = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      numerals,
      genres: [genre.trim().toLowerCase() || "custom"],
      difficulty,
    };

    onSave(prog);
    reset();
    onClose();
  }, [name, numerals, genre, difficulty, onSave, reset, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-[90vw] max-w-md bg-card border border-border rounded-2xl shadow-xl p-5 md:p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">New Progression</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Jazzy Turnaround"
            className="w-full px-3 py-2 md:py-2.5 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Chord numerals */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Chords (roman numerals)
          </label>

          {/* Current numerals */}
          {numerals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {numerals.map((n, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium"
                >
                  {n}
                  <button onClick={() => removeNumeral(i)} className="hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Quick-add buttons */}
          <div className="flex flex-wrap gap-1 mb-2">
            {["I", "ii", "iii", "IV", "V", "vi", "vii°", "bVII", "bIII", "i", "iv", "v"].map(
              (n) => (
                <button
                  key={n}
                  onClick={() => addNumeral(n)}
                  className="px-2 py-1 md:px-2.5 md:py-1.5 rounded-md bg-secondary text-xs font-medium hover:bg-accent transition-colors"
                >
                  {n}
                </button>
              )
            )}
          </div>

          {/* Custom numeral input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={currentNumeral}
              onChange={(e) => setCurrentNumeral(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && currentNumeral.trim()) {
                  addNumeral(currentNumeral);
                }
              }}
              placeholder="or type a numeral..."
              className="flex-1 px-3 py-2 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => addNumeral(currentNumeral)}
              disabled={!currentNumeral.trim()}
              className="px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        {/* Genre */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Genre tag</label>
          <input
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="e.g. jazz, rock, custom"
            className="w-full px-3 py-2 md:py-2.5 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Difficulty */}
        <div className="mb-5">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Difficulty</label>
          <div className="flex bg-secondary rounded-lg p-0.5">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  difficulty === d
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-secondary-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive mb-3">{error}</p>
        )}

        {/* Preview */}
        {numerals.length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-secondary/50 text-sm text-muted-foreground">
            Preview: {numerals.join(" - ")}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-secondary hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small button to open the dialog — place in the sidebar */
export function AddProgressionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full px-3 py-2.5 md:py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-dashed border-border"
    >
      <Plus className="w-4 h-4" />
      Add progression
    </button>
  );
}
