"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@music-apps/ui";
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
  MoreHorizontal,
  Check,
} from "lucide-react";
import { AppSwitcher } from "@music-apps/shared/app-switcher";

interface Folder {
  id: string;
  name: string;
  _count: { songFolders: number };
}

interface SongFolderRef {
  folderId: string;
  folder: { id: string; name: string };
}

interface Song {
  id: string;
  title: string;
  originalFilename: string;
  durationSec: number | null;
  processingStatus: string;
  pinned: boolean;
  folders: SongFolderRef[];
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

export default function LibraryPageWrapper() {
  return (
    <Suspense>
      <LibraryPage />
    </Suspense>
  );
}

function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [songs, setSongs] = useState<Song[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFolder, _setActiveFolder] = useState<string | null>(searchParams.get("folder"));

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch("/shreddy/api/songs");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSongs(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/shreddy/api/folders");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setFolders(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSongs();
    fetchFolders();
    const interval = setInterval(fetchSongs, 3000);
    return () => clearInterval(interval);
  }, [fetchSongs, fetchFolders]);

  const setActiveFolder = useCallback((folderId: string | null) => {
    _setActiveFolder(folderId);
    const url = folderId ? `/?folder=${folderId}` : "/";
    router.replace(url, { scroll: false });
  }, [router]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("added");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderPickerQuery, setFolderPickerQuery] = useState("");

  // Folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");

  // Move-to-folder dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingSongId, setMovingSongId] = useState<string | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  // YouTube import
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeImporting, setYoutubeImporting] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Per-import "Analyze structure" toggle (shown in the URL modal).
  // Initialized from /api/settings.analyzeOnImport so the user's default is honored.
  // Uploads (which have no per-import modal) read the same default directly.
  const [analyzeSections, setAnalyzeSections] = useState(false);
  const [analyzeDefault, setAnalyzeDefault] = useState(false);

  useEffect(() => {
    fetch("/shreddy/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const def = !!data.analyzeOnImport;
        setAnalyzeDefault(def);
        setAnalyzeSections(def);
      })
      .catch(() => {});
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    // Uploads have no per-import dialog — use the saved default from Settings.
    formData.append("analyzeSections", String(analyzeDefault));

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
        xhr.open("POST", "/shreddy/api/uploads");
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
      const res = await fetch("/shreddy/api/import/youtube", {
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
    await fetch(`/shreddy/api/songs/${id}/duplicate`, { method: "POST" });
    await fetchSongs();
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/shreddy/api/songs/${id}`, { method: "DELETE" });
    await fetchSongs();
  }

  async function handleTogglePin(id: string, currentPinned: boolean) {
    await fetch(`/shreddy/api/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !currentPinned }),
    });
    await fetchSongs();
  }

  function openMoveDialog(songId: string) {
    const song = songs.find((s) => s.id === songId);
    setMovingSongId(songId);
    setSelectedFolderIds(new Set(song?.folders.map((f) => f.folderId) ?? []));
    setMoveDialogOpen(true);
  }

  function toggleSelectedFolder(folderId: string) {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  async function saveSongFolders() {
    if (!movingSongId) return;
    await fetch(`/shreddy/api/songs/${movingSongId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderIds: Array.from(selectedFolderIds) }),
    });
    setMoveDialogOpen(false);
    setMovingSongId(null);
    setSelectedFolderIds(new Set());
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
      await fetch(`/shreddy/api/folders/${editingFolder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
    } else {
      await fetch("/shreddy/api/folders", {
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
    await fetch(`/shreddy/api/folders/${id}`, { method: "DELETE" });
    if (activeFolder === id) setActiveFolder(null);
    await fetchFolders();
    await fetchSongs();
  }

  // Filter songs by folder and search
  const filteredSongs = songs.filter((s) => {
    if (activeFolder && !s.folders.some((f) => f.folderId === activeFolder)) return false;
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
            {song.folders.length > 0 && !activeFolder && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="flex items-center gap-1 flex-wrap">
                  {song.folders.map((f) => (
                    <span key={f.folderId} className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                      {f.folder.name}
                    </span>
                  ))}
                </span>
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
            onClick={(e) => { e.stopPropagation(); openMoveDialog(song.id); }}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Folders"
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
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
            onClick={() => { setYoutubeDialogOpen(true); setYoutubeError(null); setYoutubeUrl(""); setAnalyzeSections(analyzeDefault); }}
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
        <AppSwitcher currentAppId="shreddy" />
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
              {folder.name} ({folder._count.songFolders})
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

        {/* Folder picker — popover with searchable list of all folders.
            Hidden when there are few folders (≤ 3) since they fit inline. */}
        {folders.length > 3 && (
          <div className="relative shrink-0">
            <button
              onClick={() => { setFolderPickerOpen(!folderPickerOpen); setFolderPickerQuery(""); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
              title="All folders"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {folderPickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFolderPickerOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-lg shadow-lg w-64 max-h-[60vh] overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        autoFocus
                        value={folderPickerQuery}
                        onChange={(e) => setFolderPickerQuery(e.target.value)}
                        placeholder="Search folders…"
                        className="pl-7 h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto py-1">
                    <button
                      onClick={() => { setActiveFolder(null); setFolderPickerOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${activeFolder === null ? "text-primary font-medium" : "text-foreground"}`}
                    >
                      {activeFolder === null ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                      <span className="flex-1 text-left">All</span>
                      <span className="text-muted-foreground tabular-nums">{songs.length}</span>
                    </button>
                    {folders
                      .filter((f) => !folderPickerQuery || f.name.toLowerCase().includes(folderPickerQuery.toLowerCase()))
                      .map((folder) => {
                        const isActive = activeFolder === folder.id;
                        return (
                          <button
                            key={folder.id}
                            onClick={() => { setActiveFolder(folder.id); setFolderPickerOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${isActive ? "text-primary font-medium" : "text-foreground"}`}
                          >
                            {isActive ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                            <span className="flex-1 text-left truncate">{folder.name}</span>
                            <span className="text-muted-foreground tabular-nums">{folder._count.songFolders}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

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
          <Button variant="outline" onClick={() => fetchSongs()}>
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

      {/* Move to folder dialog (multi-select) */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Folders</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            {folders.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No folders yet. Create one from the library.
              </p>
            ) : (
              folders.map((folder) => {
                const checked = selectedFolderIds.has(folder.id);
                return (
                  <label
                    key={folder.id}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted active:bg-accent text-sm cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectedFolder(folder.id)}
                      className="size-4 rounded"
                    />
                    <FolderOpen className="size-4 text-muted-foreground" />
                    <span className="flex-1">{folder.name}</span>
                  </label>
                );
              })
            )}
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">
              Leave all unchecked to keep this song unfiled.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveSongFolders}>Save</Button>
            </div>
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
