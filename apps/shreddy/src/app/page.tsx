"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Star,
  FolderOpen,
  Trash2,
  Upload,
  Settings,
  Search,
  Plus,
  X,
  Music,
  Loader2,
  FolderInput,
  BarChart3,
  Link2,
  Copy,
  Pencil,
  ArrowDownAZ,
  ArrowDownUp,
  Clock,
  CalendarPlus,
} from "lucide-react";

interface Folder {
  id: string;
  name: string;
  _count: { songs: number };
}

interface Song {
  id: string;
  title: string;
  originalFilename: string;
  durationSec: number | null;
  processingStatus: string;
  pinned: boolean;
  folderId: string | null;
  folder: { id: string; name: string } | null;
  artist: string;
  album: string;
  genre: string;
  year: string;
  createdAt: string;
}

type SortMode = "title" | "artist" | "added" | "recent";

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "ready":
      return null;
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1 text-[11px]">
          <Loader2 className="size-3 animate-spin" />
          Processing
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1 text-[11px]">
          <Loader2 className="size-3 animate-spin" />
          Pending
        </Badge>
      );
    case "error":
      return <Badge variant="destructive" className="text-[11px]">Error</Badge>;
    default:
      return <Badge variant="outline" className="text-[11px]">{status}</Badge>;
  }
}

function SongSkeleton() {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
      <div className="size-5 rounded bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
    </li>
  );
}

const SORT_OPTIONS: { value: SortMode; label: string; icon: React.ReactNode }[] = [
  { value: "title", label: "Title", icon: <ArrowDownAZ className="size-3.5" /> },
  { value: "artist", label: "Artist", icon: <ArrowDownAZ className="size-3.5" /> },
  { value: "added", label: "Date Added", icon: <CalendarPlus className="size-3.5" /> },
  { value: "recent", label: "Recent", icon: <Clock className="size-3.5" /> },
];

export default function LibraryPage() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("added");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");

  // Move-to-folder dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingSongId, setMovingSongId] = useState<string | null>(null);

  // YouTube import
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeImporting, setYoutubeImporting] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Section analysis toggle (default off to save API usage)
  const [analyzeSections, setAnalyzeSections] = useState(false);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch("/api/songs");
      if (!res.ok) throw new Error("Failed to load songs");
      const data = await res.json();
      setSongs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load songs");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      if (!res.ok) throw new Error("Failed to load folders");
      const data = await res.json();
      setFolders(data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchSongs();
    fetchFolders();
    const interval = setInterval(fetchSongs, 3000);
    return () => clearInterval(interval);
  }, [fetchSongs, fetchFolders]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("analyzeSections", String(analyzeSections));

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("POST", "/api/uploads");
        xhr.send(formData);
      });

      await fetchSongs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  }

  async function handleYoutubeImport() {
    if (!youtubeUrl.trim()) return;
    setYoutubeImporting(true);
    setYoutubeError(null);
    try {
      const res = await fetch("/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim(), analyzeSections }),
      });
      const data = await res.json();
      if (!res.ok) {
        setYoutubeError(data.error || "Import failed");
        return;
      }
      setYoutubeDialogOpen(false);
      setYoutubeUrl("");
      await fetchSongs();
    } catch {
      setYoutubeError("Import failed. Check the URL and try again.");
    } finally {
      setYoutubeImporting(false);
    }
  }

  async function handleDuplicate(id: string) {
    await fetch(`/api/songs/${id}/duplicate`, { method: "POST" });
    await fetchSongs();
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/songs/${id}`, { method: "DELETE" });
    await fetchSongs();
  }

  async function handleTogglePin(id: string, currentPinned: boolean) {
    await fetch(`/api/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !currentPinned }),
    });
    await fetchSongs();
  }

  async function handleMoveSong(songId: string, folderId: string | null) {
    await fetch(`/api/songs/${songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId }),
    });
    setMoveDialogOpen(false);
    setMovingSongId(null);
    await fetchSongs();
    await fetchFolders();
  }

  function openNewFolder() {
    setEditingFolder(null);
    setFolderName("");
    setFolderDialogOpen(true);
  }

  function openEditFolder(folder: Folder) {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDialogOpen(true);
  }

  async function saveFolder() {
    if (!folderName.trim()) return;
    if (editingFolder) {
      await fetch(`/api/folders/${editingFolder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
    } else {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
    }
    setFolderDialogOpen(false);
    await fetchFolders();
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"? Songs will be moved to unfiled.`)) return;
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (activeFolder === id) setActiveFolder(null);
    await fetchFolders();
    await fetchSongs();
  }

  // Filter songs by folder and search
  const filteredSongs = songs.filter((s) => {
    if (activeFolder && s.folderId !== activeFolder) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.originalFilename.toLowerCase().includes(q);
    }
    return true;
  });

  // Sort songs
  const sortedSongs = [...filteredSongs].sort((a, b) => {
    // Pinned always first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (sortMode) {
      case "title":
        return a.title.localeCompare(b.title);
      case "artist":
        return (a.artist || "zzz").localeCompare(b.artist || "zzz");
      case "added":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "recent":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default:
        return 0;
    }
  });

  const pinnedSongs = sortedSongs.filter((s) => s.pinned);
  const unpinnedSongs = sortedSongs.filter((s) => !s.pinned);

  function renderSong(song: Song) {
    return (
      <li
        key={song.id}
        className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 active:scale-[0.99] transition-all cursor-pointer"
        onClick={() => song.processingStatus === "ready" && router.push(`/songs/${song.id}`)}
      >
        {/* Pin button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleTogglePin(song.id, song.pinned); }}
          className={`shrink-0 p-1.5 -m-1 rounded-full active:scale-90 transition-transform ${
            song.pinned ? "text-amber-500" : "text-muted-foreground/30 hover:text-amber-400"
          }`}
          title={song.pinned ? "Unpin" : "Pin"}
        >
          <Star className="size-4" fill={song.pinned ? "currentColor" : "none"} />
        </button>

        {/* Song info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {song.processingStatus === "ready" ? (
              <Link
                href={`/songs/${song.id}`}
                className="text-sm font-medium hover:underline truncate text-foreground"
              >
                {song.title}
              </Link>
            ) : (
              <span className="text-sm font-medium truncate text-muted-foreground">
                {song.title}
              </span>
            )}
            {statusBadge(song.processingStatus)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {song.artist && (
              <>
                <span className="truncate max-w-[150px]">{song.artist}</span>
                <span className="text-muted-foreground/30">·</span>
              </>
            )}
            {song.durationSec ? (
              <>
                <span className="tabular-nums">{formatDuration(song.durationSec)}</span>
              </>
            ) : null}
            {song.folder && !activeFolder && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{song.folder.name}</span>
              </>
            )}
            {song.genre && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-[11px]">{song.genre}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions — visible on group hover on desktop, always visible on touch */}
        <div className="flex items-center gap-0 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          {song.processingStatus === "ready" && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDuplicate(song.id); }}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
              title="Duplicate"
            >
              <Copy className="size-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setMovingSongId(song.id); setMoveDialogOpen(true); }}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Move to folder"
          >
            <FolderInput className="size-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(song.id, song.title); }}
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Shreddy</h1>
        <div className="flex items-center gap-1">
          <Link
            href="/stats"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Practice Stats"
          >
            <BarChart3 className="size-5" />
          </Link>
          <Link
            href="/settings"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Settings"
          >
            <Settings className="size-5" />
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setYoutubeDialogOpen(true); setYoutubeError(null); setYoutubeUrl(""); }}
            className="gap-1 h-8 px-2.5 text-xs"
          >
            <Link2 className="size-3.5" />
            URL
          </Button>
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById("file-upload")?.click()}
            className="gap-1 h-8 px-2.5 text-xs"
          >
            {uploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {uploadProgress > 0 ? `${uploadProgress}%` : "..."}
              </>
            ) : (
              <>
                <Upload className="size-3.5" />
                Upload
              </>
            )}
          </Button>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={analyzeSections}
            onChange={(e) => setAnalyzeSections(e.target.checked)}
            className="size-3.5 rounded"
          />
          <span className="text-[11px] text-muted-foreground">Analyze structure (AI)</span>
        </label>
        <input
          id="file-upload"
          type="file"
          accept=".mp3,.mp4,audio/mpeg,video/mp4"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Upload progress bar */}
      {uploading && uploadProgress > 0 && (
        <div className="mb-3 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search songs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 bg-card text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Folder tabs + Sort */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 pb-0.5 -mx-1 px-1">
          <button
            onClick={() => setActiveFolder(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95 ${
              activeFolder === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            All ({songs.length})
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setActiveFolder(folder.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95 flex items-center gap-1 ${
                activeFolder === folder.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {folder.name} ({folder._count.songs})
            </button>
          ))}
          <button
            onClick={openNewFolder}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-90 transition-all shrink-0"
            title="New folder"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* Folder actions (rename/delete) when a folder is active */}
        {activeFolder && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => {
                const folder = folders.find((f) => f.id === activeFolder);
                if (folder) openEditFolder(folder);
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
              title="Rename folder"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={() => {
                const folder = folders.find((f) => f.id === activeFolder);
                if (folder) deleteFolder(folder.id, folder.name);
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive active:scale-90 transition-all"
              title="Delete folder"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}

        {/* Sort button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setSortMenuOpen(!sortMenuOpen)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
            title="Sort"
          >
            <ArrowDownUp className="size-3.5" />
            <span className="hidden sm:inline">{SORT_OPTIONS.find(o => o.value === sortMode)?.label}</span>
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSortMode(opt.value); setSortMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted transition-colors ${
                      sortMode === opt.value ? "text-primary font-medium" : "text-foreground"
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10 mb-4">
            <X className="size-6 text-destructive" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">Something went wrong</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchSongs(); }}>
            Try again
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <ul className="space-y-0.5">
          <SongSkeleton />
          <SongSkeleton />
          <SongSkeleton />
          <SongSkeleton />
          <SongSkeleton />
        </ul>
      )}

      {/* Song list */}
      {!loading && !error && (
        <>
          {sortedSongs.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center size-16 rounded-full bg-muted mb-4">
                {searchQuery ? (
                  <Search className="size-7 text-muted-foreground" />
                ) : (
                  <Music className="size-7 text-muted-foreground" />
                )}
              </div>
              <p className="text-base font-medium text-foreground mb-1">
                {searchQuery
                  ? "No matching songs"
                  : activeFolder
                  ? "No songs in this folder"
                  : "No songs yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "Upload an MP3 or MP4 to get started"}
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {pinnedSongs.length > 0 && (
                <>
                  <div className="px-3 pt-2.5 pb-1">
                    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Pinned
                    </h2>
                  </div>
                  <ul className="divide-y divide-border/50">
                    {pinnedSongs.map(renderSong)}
                  </ul>
                  {unpinnedSongs.length > 0 && <div className="border-t border-border" />}
                </>
              )}

              {unpinnedSongs.length > 0 && (
                <>
                  {pinnedSongs.length > 0 && (
                    <div className="px-3 pt-2.5 pb-1">
                      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Library
                      </h2>
                    </div>
                  )}
                  <ul className="divide-y divide-border/50">
                    {unpinnedSongs.map(renderSong)}
                  </ul>
                </>
              )}

              <div className="px-3 py-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground/50">
                  {sortedSongs.length} song{sortedSongs.length !== 1 ? "s" : ""}
                  {activeFolder ? " in folder" : ""}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Folder create/edit dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Rename Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => e.key === "Enter" && saveFolder()}
              autoFocus
              className="h-10"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveFolder}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to folder dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            <button
              onClick={() => movingSongId && handleMoveSong(movingSongId, null)}
              className="w-full text-left px-3 py-3 rounded-lg hover:bg-muted active:bg-accent text-sm transition-colors"
            >
              No folder (unfiled)
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => movingSongId && handleMoveSong(movingSongId, folder.id)}
                className="w-full text-left px-3 py-3 rounded-lg hover:bg-muted active:bg-accent text-sm flex items-center gap-2 transition-colors"
              >
                <FolderOpen className="size-4 text-muted-foreground" />
                {folder.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* YouTube import dialog */}
      <Dialog open={youtubeDialogOpen} onOpenChange={setYoutubeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Import from YouTube</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Input
                value={youtubeUrl}
                onChange={(e) => { setYoutubeUrl(e.target.value); setYoutubeError(null); }}
                placeholder="Paste YouTube URL..."
                onKeyDown={(e) => e.key === "Enter" && handleYoutubeImport()}
                autoFocus
                className="h-10"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                For personal practice use only. Max 10 min.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={analyzeSections}
                onChange={(e) => setAnalyzeSections(e.target.checked)}
                className="size-4 rounded"
              />
              <span className="text-sm">Analyze structure <span className="text-muted-foreground">(AI)</span></span>
            </label>
            {youtubeError && (
              <p className="text-sm text-destructive">{youtubeError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setYoutubeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleYoutubeImport} disabled={youtubeImporting || !youtubeUrl.trim()}>
                {youtubeImporting ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1.5" />
                    Importing...
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
