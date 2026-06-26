"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@music-apps/ui";
import { ArrowLeft, Save, Loader2, Moon, Sun, Activity, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface DepStatus {
  name: string;
  installed: boolean;
  version?: string;
  required: boolean;
  installHint: string;
}

export default function SettingsPage() {
  const [youtubeMaxDuration, setYoutubeMaxDuration] = useState(10); // minutes
  const [analyzeOnImport, setAnalyzeOnImport] = useState(false);
  const [combineSubsections, setCombineSubsections] = useState(true);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [deps, setDeps] = useState<DepStatus[]>([]);
  const [depsLoading, setDepsLoading] = useState(true);

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));

    fetch("/shreddy/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setYoutubeMaxDuration(Math.floor((data.youtubeMaxDuration || 600) / 60));
        setAnalyzeOnImport(!!data.analyzeOnImport);
        setCombineSubsections(data.combineSubsections ?? true);
        setLoading(false);
      });

    fetch("/shreddy/api/health")
      .then((res) => res.json())
      .then((data) => {
        setDeps(data.dependencies || []);
        setDepsLoading(false);
      })
      .catch(() => setDepsLoading(false));
  }, []);

  function toggleDarkMode() {
    const newValue = !darkMode;
    setDarkMode(newValue);
    document.documentElement.classList.toggle("dark", newValue);
    localStorage.setItem("theme", newValue ? "dark" : "light");
  }

  async function handleSave() {
    const body: Record<string, unknown> = {
      youtubeMaxDuration: youtubeMaxDuration * 60,
      analyzeOnImport,
      combineSubsections,
    };
    await fetch("/shreddy/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Dark mode toggle */}
        <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="size-5 text-muted-foreground" /> : <Sun className="size-5 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark themes</p>
            </div>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative w-11 h-6 rounded-full transition-colors ${darkMode ? "bg-primary" : "bg-muted"}`}
          >
            <div
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${darkMode ? "translate-x-5.5" : "translate-x-0.5"}`}
            />
          </button>
        </div>

        {/* System Health */}
        <div className="p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">System Dependencies</p>
          </div>
          {depsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking...
            </div>
          ) : (
            <div className="space-y-2">
              {deps.map((dep) => (
                <div key={dep.name} className="flex items-start gap-2">
                  {dep.installed ? (
                    <CheckCircle2 className="size-4 mt-0.5 text-green-500 shrink-0" />
                  ) : dep.required ? (
                    <XCircle className="size-4 mt-0.5 text-red-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-4 mt-0.5 text-yellow-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="text-sm text-foreground">
                      {dep.name}
                      {dep.version && <span className="text-muted-foreground ml-1">({dep.version})</span>}
                      {!dep.required && <span className="text-muted-foreground ml-1">(optional)</span>}
                    </span>
                    {!dep.installed && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">{dep.installHint}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Import + analysis settings */}
        <div className="p-4 bg-card rounded-xl border border-border space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">YouTube Max Duration</p>
              <p className="text-xs text-muted-foreground">Maximum video length for YouTube imports</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={1}
                max={60}
                value={youtubeMaxDuration}
                onChange={(e) => setYoutubeMaxDuration(parseInt(e.target.value) || 10)}
                className="w-16 h-9 px-2 text-sm text-center border border-border rounded-lg bg-background text-foreground"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Analyze structure on import</p>
              <p className="text-xs text-muted-foreground">
                Run AI section detection automatically when a song is uploaded.
              </p>
            </div>
            <button
              onClick={() => setAnalyzeOnImport(!analyzeOnImport)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${analyzeOnImport ? "bg-primary" : "bg-muted"}`}
              aria-label="Toggle analyze on import"
            >
              <div
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${analyzeOnImport ? "translate-x-5.5" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Combine sub-sections</p>
              <p className="text-xs text-muted-foreground">
                Merge adjacent same-label segments (e.g. two consecutive choruses → one Chorus) and
                absorb leading/trailing silence into Intro/Outro. Turn off to see the raw analyzer
                output unchanged.
              </p>
            </div>
            <button
              onClick={() => setCombineSubsections(!combineSubsections)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${combineSubsections ? "bg-primary" : "bg-muted"}`}
              aria-label="Toggle combine sub-sections"
            >
              <div
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${combineSubsections ? "translate-x-5.5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-1.5">
            {saved ? (
              <>Saved!</>
            ) : (
              <>
                <Save className="size-4" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>
    </main>
  );
}
