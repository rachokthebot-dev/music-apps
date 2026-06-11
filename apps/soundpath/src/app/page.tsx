"use client";

/**
 * Landing page — two entry points to the app.
 *
 *   Upload existing preset → /edit/   (signal-flow editor + Match Song + …)
 *   Design new preset      → /design/ (3 tone fields → Gemini designs chain + snapshots)
 *
 * No master is auto-loaded here. The editor route guards itself: if no master
 * has been uploaded, it shows the same chooser embedded.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function Landing() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setBusy(true);
      setErr(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/master", { method: "POST", body: form });
        const j = (await r.json()) as { ok: boolean; error?: string };
        if (!j.ok) throw new Error(j.error ?? "upload failed");
        router.push("/edit");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBusy(false);
      }
    },
    [router]
  );

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
    e.target.value = "";
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold mb-2">soundpath</h1>
          <p className="text-sm text-zinc-400">
            Analyze and design Helix LT presets holistically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={onPickFile}
            disabled={busy}
            className="text-left rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900 p-6 transition disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-md bg-blue-900/40 text-blue-200 p-2">
                <UploadIcon />
              </div>
              <h2 className="text-lg font-medium">Upload existing preset</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-3">
              Load a <code className="text-zinc-300">.hlx</code> you've exported from HX Edit and
              run analysis, Match Song, Tone Discovery, or Align Gain on it.
            </p>
            <div className="text-xs text-blue-300">
              {busy ? "Uploading…" : "Drop or pick a .hlx file →"}
            </div>
          </button>

          <button
            onClick={() => router.push("/design")}
            disabled={busy}
            className="text-left rounded-xl border border-zinc-800 hover:border-purple-700/50 bg-zinc-900/50 hover:bg-purple-950/20 p-6 transition disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-md bg-purple-900/40 text-purple-200 p-2">
                <SparkIcon />
              </div>
              <h2 className="text-lg font-medium">Design new preset</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-3">
              Describe 3 tones in plain English. Gemini designs the entire preset — chain,
              parallel paths, 8 snapshots, and solo variants.
            </p>
            <div className="text-xs text-purple-300">Start from blank →</div>
          </button>
        </div>

        {err && (
          <div className="mt-6 rounded-md border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-200">
            {err}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".hlx,application/json"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </main>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M12 16V4M12 4l-5 5M12 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" strokeLinecap="round" />
      <path d="M5.6 5.6l4 4M18.4 5.6l-4 4M5.6 18.4l4-4M18.4 18.4l-4-4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
