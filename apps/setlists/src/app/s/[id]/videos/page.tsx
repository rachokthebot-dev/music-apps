"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { WizardRail } from "@/components/WizardRail";
import { VideoPicker } from "@/components/VideoPicker";

interface Song {
  id: string;
  title: string;
  artist: string;
  lickbankVideoUrl: string | null;
  shreddyVideoUrl: string | null;
}

interface Setlist {
  id: string;
  name: string;
  songs: Song[];
}

export default function VideosStep({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lane?: string }>;
}) {
  const { id } = use(params);
  const sp = searchParams ? use(searchParams) : undefined;
  const lane: "lesson" | "track" = sp?.lane === "track" ? "track" : "lesson";

  const [setlist, setSetlist] = useState<Setlist | null>(null);

  useEffect(() => {
    fetch(`/setlists/api/setlists/${id}`)
      .then((r) => r.json())
      .then(setSetlist)
      .catch(() => {});
  }, [id]);

  const select = async (songId: string, url: string | null) => {
    const field = lane === "lesson" ? "lickbankVideoUrl" : "shreddyVideoUrl";
    setSetlist((prev) =>
      prev
        ? { ...prev, songs: prev.songs.map((s) => (s.id === songId ? { ...s, [field]: url } : s)) }
        : prev
    );
    await fetch(`/setlists/api/songs/${songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: url }),
    });
  };

  if (!setlist) {
    return <div className="p-5 text-sm text-muted-foreground">Loading…</div>;
  }

  const chosen = setlist.songs.filter((s) =>
    lane === "lesson" ? s.lickbankVideoUrl : s.shreddyVideoUrl
  ).length;

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto p-5">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Setlists
        </Link>
        <h1 className="text-lg font-semibold">{setlist.name}</h1>
      </header>

      <WizardRail setlistId={id} current={lane === "lesson" ? "videos" : "track-videos"} />

      <div className="bg-card border border-border rounded-xl p-4 mb-3">
        <h2 className="text-[15px] font-semibold">
          {lane === "lesson" ? "Lesson videos — for slicing licks" : "Track videos — for practice & stems"}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {lane === "lesson"
            ? "Chapters become LickBank sections automatically. Videos without them import fine, just without structure."
            : "Shreddy splits these into stems, so the studio master beats a live take or a lyrics re-upload."}
        </p>
      </div>

      {setlist.songs.map((s) => (
        <VideoPicker
          key={`${s.id}-${lane}`}
          songId={s.id}
          title={s.title}
          artist={s.artist}
          lane={lane}
          selectedUrl={lane === "lesson" ? s.lickbankVideoUrl : s.shreddyVideoUrl}
          onSelect={(url) => select(s.id, url)}
        />
      ))}

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">
          {chosen} of {setlist.songs.length} chosen
        </span>
        <Link
          href={
            lane === "lesson"
              ? `/s/${id}/videos?lane=track`
              : `/s/${id}/presets`
          }
          className="bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5"
        >
          {lane === "lesson" ? "Shreddy videos →" : "Helix presets →"}
        </Link>
      </div>
    </div>
  );
}
