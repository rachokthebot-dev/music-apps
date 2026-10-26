"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
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
  ArrowsDownUpIcon,
  CalendarPlusIcon,
  ChartBarIcon,
  CircleNotchIcon,
  ClockIcon,
  CopyIcon,
  DotsSixVerticalIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  GearSixIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MusicNotesIcon,
  PencilSimpleIcon,
  PlaylistIcon,
  SortAscendingIcon,
  StarIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AppShell, SidebarItem, SidebarMenuButton, SidebarSection } from "@music-apps/shared/app-shell";
import { YouTubeSearchPanel } from "@music-apps/shared/youtube-search-panel";
import { PlaylistImportDialog } from "@/components/PlaylistImportDialog";
import { SwipeRow, type SwipeAction } from "@/components/SwipeRow";

interface Folder {
  id: string;
  name: string;
  _count: { songFolders: number };
}

interface SongFolderRef {
  folderId: string;
  /** The song's place within this folder. */
  orderIndex: number;
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
  musicalKey: string;
  bpm: number | null;
  sections: { startSec: number; endSec: number }[];
  createdAt: string;
}

interface WeekStats {
  streak: number;
  dailyBreakdown: { date: string; totalSec: number }[];
}

type SortMode = "custom" | "title" | "artist" | "added" | "recent";

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
          <CircleNotchIcon className="size-3 animate-spin" />
          Processing
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1 text-[11px]">
          <CircleNotchIcon className="size-3 animate-spin" />
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
    <li className="flex items-center gap-3 px-4 py-3 min-h-[4.5rem] rounded-2xl border border-border bg-card animate-pulse">
      <div className="size-11 rounded-xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted rounded w-2/3" />
        <div className="h-3.5 bg-muted rounded w-1/3" />
      </div>
    </li>
  );
}

// Same order as the player's section dots, so a song's bar here matches the
// sections you see when you open it.
const SECTION_BAR_COLORS = [
  "bg-violet-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400",
  "bg-cyan-400", "bg-fuchsia-400", "bg-lime-400", "bg-orange-400", "bg-teal-400",
];
const COVER_COLORS = [
  "bg-violet-500/15 text-violet-500", "bg-sky-500/15 text-sky-500", "bg-emerald-500/15 text-emerald-500",
  "bg-amber-500/15 text-amber-500", "bg-rose-500/15 text-rose-500", "bg-fuchsia-500/15 text-fuchsia-500",
];

/** "G Minor" → "Gm", "F# Major" → "F♯". */
function shortKey(key: string): string {
  const m = key.match(/^([A-G][#b]?)\s*(Major|Minor)?/i);
  if (!m) return key;
  return m[1].replace("#", "♯").replace("b", "♭") + (/minor/i.test(m[2] ?? "") ? "m" : "");
}

function formatHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const SORT_OPTIONS: { value: SortMode; label: string; icon: React.ReactNode }[] = [
  { value: "custom", label: "Folder order", icon: <DotsSixVerticalIcon className="size-3.5" /> },
  { value: "title", label: "Title", icon: <SortAscendingIcon className="size-3.5" /> },
  { value: "artist", label: "Artist", icon: <SortAscendingIcon className="size-3.5" /> },
  { value: "added", label: "Date Added", icon: <CalendarPlusIcon className="size-3.5" /> },
  { value: "recent", label: "Recent", icon: <ClockIcon className="size-3.5" /> },
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
  // "custom" is the folder's own drag-and-drop order; the whole library has
  // none, so there it falls back to date added.
  const [sortMode, setSortMode] = useState<SortMode>("custom");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // The one row whose swipe actions are showing
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  useEffect(() => {
    fetch("/shreddy/api/stats")
      .then((r) => r.json())
      .then(setWeekStats)
      .catch(() => {});
  }, []);

  // Drag-to-reorder within a folder
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragListRef = useRef<HTMLElement | null>(null);

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
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeImporting, setYoutubeImporting] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Per-import "Analyze structure" toggle (shown in the URL modal).
  // Initialized from /api/settings.analyzeOnImport so the user's default is honored.
  // Uploads (which have no per-import modal) read the same default directly.
  const [analyzeSections, setAnalyzeSections] = useState(false);
  const [analyzeDefault, setAnalyzeDefault] = useState(false);
  // Search results longer than this can't be imported, so the picker greys them out.
  const [maxDuration, setMaxDuration] = useState(600);

  useEffect(() => {
    fetch("/shreddy/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const def = !!data.analyzeOnImport;
        setAnalyzeDefault(def);
        setAnalyzeSections(def);
        if (typeof data.youtubeMaxDuration === "number") setMaxDuration(data.youtubeMaxDuration);
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
    if (!confirm(`Delete folder "${name}"? The songs stay in your library.`)) return;
    await fetch(`/shreddy/api/folders/${id}`, { method: "DELETE" });
    if (activeFolder === id) setActiveFolder(null);
    await fetchFolders();
    await fetchSongs();
  }

  const activeFolderRecord = activeFolder ? folders.find((f) => f.id === activeFolder) ?? null : null;

  // Filter songs by folder and search
  const filteredSongs = songs.filter((s) => {
    if (activeFolder && !s.folders.some((f) => f.folderId === activeFolder)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.originalFilename.toLowerCase().includes(q);
    }
    return true;
  });

  const effectiveSort: SortMode = sortMode === "custom" && !activeFolder ? "added" : sortMode;
  const folderPos = (s: Song) =>
    s.folders.find((f) => f.folderId === activeFolder)?.orderIndex ?? 0;

  // Sort songs
  const sortedSongs = [...filteredSongs].sort((a, b) => {
    // Pinned always first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (effectiveSort) {
      case "custom":
        return folderPos(a) - folderPos(b) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

  // While a drag is in progress rows are placed by dragOrder through CSS
  // `order`, and the DOM keeps the server's order. Reordering the DOM would
  // have React move the dragged row's own node whenever it goes down, which
  // drops its pointer capture on iPad and ends the drag after one step.
  const visualOrder = dragOrder ?? sortedSongs.map((s) => s.id);
  const visualPos = new Map(visualOrder.map((id, i) => [id, i]));

  // Only the whole folder, in its own order, can be rearranged — a filtered
  // or re-sorted view has no single order to write back.
  const canReorder = !!activeFolder && effectiveSort === "custom" && !searchQuery;

  /*
   * Drag to reorder, by the grip on each row. Pointer events rather than
   * HTML5 drag-and-drop, which never fires on iOS Safari. A row moves only
   * within its own list, so pinned songs stay above the rest.
   */
  function onGripDown(e: React.PointerEvent, songId: string) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const list = (e.currentTarget as HTMLElement).closest("ul");
    if (!list) return;
    dragListRef.current = list;
    setDragId(songId);
    setDragOrder(sortedSongs.map((s) => s.id));
  }

  function onGripMove(e: React.PointerEvent) {
    const list = dragListRef.current;
    if (!dragId || !list) return;
    const rows = (Array.from(list.children) as HTMLElement[]).sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
    );
    const target =
      rows.find((r) => {
        const rect = r.getBoundingClientRect();
        return e.clientY < rect.top + rect.height / 2;
      }) ?? rows[rows.length - 1];
    const targetId = target?.dataset.songId;
    if (!targetId || targetId === dragId) return;
    setDragOrder((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const from = next.indexOf(dragId);
      const to = next.indexOf(targetId);
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  }

  async function onGripUp() {
    const order = dragOrder;
    dragListRef.current = null;
    setDragId(null);
    setDragOrder(null);
    if (!order || !activeFolder) return;
    if (order.every((id, i) => id === sortedSongs[i]?.id)) return;
    // Optimistic, so the row stays where it was dropped while the write lands.
    setSongs((prev) =>
      prev.map((s) => ({
        ...s,
        folders: s.folders.map((f) =>
          f.folderId === activeFolder ? { ...f, orderIndex: order.indexOf(s.id) } : f
        ),
      }))
    );
    await fetch(`/shreddy/api/folders/${activeFolder}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds: order }),
    }).catch(() => {});
    await fetchSongs();
  }

  // Carry the folder being browsed into the player, so its Back control
  // returns to that folder rather than to the whole library.
  function songHref(songId: string) {
    return activeFolder
      ? `/songs/${songId}?folder=${encodeURIComponent(activeFolder)}`
      : `/songs/${songId}`;
  }

  function renderSong(song: Song) {
    const ready = song.processingStatus === "ready";
    const actions: SwipeAction[] = [
      {
        label: song.pinned ? "Unpin" : "Pin",
        icon: <StarIcon className="size-5" weight={song.pinned ? "fill" : "regular"} />,
        className: "bg-amber-500",
        onSelect: () => handleTogglePin(song.id, song.pinned),
      },
      ...(ready
        ? [{ label: "Copy", icon: <CopyIcon className="size-5" />, className: "bg-zinc-500", onSelect: () => handleDuplicate(song.id) }]
        : []),
      { label: "Move", icon: <FolderPlusIcon className="size-5" />, className: "bg-blue-600", onSelect: () => openMoveDialog(song.id) },
      { label: "Delete", icon: <TrashIcon className="size-5" />, className: "bg-red-500", onSelect: () => handleDelete(song.id, song.title) },
    ];
    const total = song.durationSec || song.sections.at(-1)?.endSec || 0;
    return (
      <SwipeRow
        key={song.id}
        data-song-id={song.id}
        style={{ order: visualPos.get(song.id) }}
        actions={actions}
        open={swipedId === song.id}
        onOpenChange={(o) => setSwipedId(o ? song.id : null)}
        className={`rounded-2xl border border-border ${dragId === song.id ? "ring-2 ring-primary/40" : ""}`}
      >
        <div
          className="group relative flex items-center gap-3 px-4 py-3 min-h-[4.5rem] cursor-pointer active:bg-muted/60 transition-colors"
          onClick={() => ready && router.push(songHref(song.id))}
        >
          {canReorder && (
            <span
              onPointerDown={(e) => onGripDown(e, song.id)}
              onPointerMove={onGripMove}
              onPointerUp={onGripUp}
              onPointerCancel={onGripUp}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 p-2.5 -m-2 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: "none" }}
              title="Drag to reorder"
            >
              <DotsSixVerticalIcon className="size-5" />
            </span>
          )}

          {ready ? (
            <div className={`relative size-11 shrink-0 rounded-xl grid place-items-center text-base font-semibold ${COVER_COLORS[song.title.charCodeAt(0) % COVER_COLORS.length]}`}>
              {song.title.trim()[0]?.toUpperCase()}
              {song.pinned && (
                <StarIcon className="absolute -top-1 -right-1 size-4 text-amber-500 drop-shadow" weight="fill" />
              )}
            </div>
          ) : (
            <div className="size-11 shrink-0 rounded-xl bg-muted animate-pulse" />
          )}

          {/* Song info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-base font-semibold truncate ${ready ? "text-foreground" : "text-muted-foreground"}`}>
                {song.title}
              </span>
              {song.processingStatus === "error" && statusBadge(song.processingStatus)}
              {/* YouTube imports keep the source URL in originalFilename — link
                  back to it so the original is one tap away. */}
              {/^https?:\/\//.test(song.originalFilename) && (
                <a
                  href={song.originalFilename}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open the source video on YouTube"
                  aria-label="Open the source video on YouTube"
                  className="shrink-0 p-1 -m-1 text-muted-foreground/50 hover:text-red-500 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
                  </svg>
                </a>
              )}
            </div>
            {ready || song.processingStatus === "error" ? (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                {song.artist && <span className="truncate max-w-[14rem]">{song.artist}</span>}
                {song.folders.length > 0 && !activeFolder && (
                  <span className="flex items-center gap-1 min-w-0 overflow-hidden">
                    {song.artist && <span className="text-muted-foreground/40">·</span>}
                    {song.folders.map((f) => (
                      <span key={f.folderId} className="bg-muted px-1.5 py-0.5 rounded-md text-xs whitespace-nowrap">
                        {f.folder.name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ) : (
              // Still importing: say what's happening, in the row's own shape.
              <div className="flex items-center gap-2 text-sm text-loop">
                <span className="size-1.5 rounded-full bg-loop animate-pulse" />
                {song.processingStatus === "pending" ? "Waiting to process" : "Finding key, tempo and sections"}
              </div>
            )}
          </div>

          {/* The song's structure at a glance */}
          {song.sections.length > 0 && total > 0 && (
            <div className="hidden md:flex w-28 xl:w-48 h-2 gap-0.5 rounded-full overflow-hidden shrink-0" title={`${song.sections.length} sections`}>
              {song.sections.map((sec, idx) => (
                <span
                  key={idx}
                  className={SECTION_BAR_COLORS[idx % SECTION_BAR_COLORS.length]}
                  style={{ width: `${((sec.endSec - sec.startSec) / total) * 100}%` }}
                />
              ))}
            </div>
          )}

          <div className="hidden sm:block w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
            {[song.musicalKey && shortKey(song.musicalKey), song.bpm && Math.round(song.bpm)].filter(Boolean).join(" · ")}
          </div>
          <div className="w-12 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
            {formatDuration(song.durationSec)}
          </div>

          {/* With a mouse there's no swipe, so the actions appear on hover —
              floating over the row's end rather than holding a column open,
              which on a narrow window squeezed the title down to one letter. */}
          <div className="hidden [@media(pointer:fine)]:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 p-1 rounded-xl bg-card border border-border shadow-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={(e) => { e.stopPropagation(); a.onSelect(); }}
                className="size-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all [&_svg]:size-4"
                title={a.label}
              >
                {a.icon}
              </button>
            ))}
          </div>
        </div>
      </SwipeRow>
    );
  }

  const last7 = weekStats?.dailyBreakdown ?? [];
  const last7Max = Math.max(1, ...last7.map((d) => d.totalSec));

  return (
    <AppShell
      appId="shreddy"
      title="Shreddy"
      sidebar={
        <>
          <SidebarItem
            active={activeFolder === null}
            icon={<MusicNotesIcon className="size-5" />}
            label="All songs"
            count={songs.length}
            onClick={() => setActiveFolder(null)}
          />
          <SidebarSection label="Folders" onAdd={openNewFolder} addLabel="New folder" />
          {folders.map((folder) => (
            <SidebarItem
              key={folder.id}
              active={activeFolder === folder.id}
              icon={activeFolder === folder.id ? <FolderOpenIcon className="size-5" /> : <FolderIcon className="size-5" />}
              label={folder.name}
              count={folder._count.songFolders}
              onClick={() => setActiveFolder(folder.id)}
            />
          ))}
        </>
      }
      footer={
        weekStats && (
          <Link href="/stats" className="block rounded-2xl bg-muted p-4 active:scale-[0.98] transition-transform">
            <div className="text-3xl font-semibold leading-9">
              {weekStats.streak} {weekStats.streak === 1 ? "day" : "days"}
            </div>
            <div className="text-sm text-muted-foreground">
              streak · {formatHours(last7.reduce((sum, d) => sum + d.totalSec, 0))} in 7 days
            </div>
            <div className="mt-3 flex items-end gap-1.5 h-12">
              {last7.map((d, idx) => (
                <div
                  key={d.date}
                  className={`flex-1 rounded ${idx === last7.length - 1 ? "bg-loop" : "bg-foreground/25"}`}
                  style={{ height: `${Math.max(6, (d.totalSec / last7Max) * 100)}%` }}
                  title={`${d.date}: ${formatHours(d.totalSec)}`}
                />
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">
              {last7.map((d) => (
                <span key={d.date} className="flex-1 text-center text-xs text-muted-foreground">
                  {"SMTWTFS"[new Date(`${d.date}T12:00:00`).getDay()]}
                </span>
              ))}
            </div>
          </Link>
        )
      }
    >
    <main className="flex-1 max-w-4xl lg:max-w-none mx-auto w-full px-4 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 lg:hidden">
          <SidebarMenuButton />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Shreddy</h1>
        </div>
        {/* On a phone the actions take their own row under the title, so the
            app menu stays beside the name instead of wrapping on its own. */}
        <div className="order-last w-full sm:order-none sm:w-auto flex items-center gap-2 lg:ml-auto">
          <Link
            href="/stats"
            className="size-11 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Practice Stats"
          >
            <ChartBarIcon className="size-5" />
          </Link>
          <Link
            href="/settings"
            className="size-11 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Settings"
          >
            <GearSixIcon className="size-5" />
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setYoutubeDialogOpen(true); setYoutubeError(null); setYoutubeUrl(""); setAnalyzeSections(analyzeDefault); }}
            className="gap-1.5 h-11 px-3.5 sm:px-4 rounded-full text-sm font-semibold"
            aria-label="Import from a YouTube link"
          >
            <LinkIcon className="size-4" />
            <span className="hidden sm:inline">URL</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlaylistDialogOpen(true)}
            className="gap-1.5 h-11 px-3.5 sm:px-4 rounded-full text-sm font-semibold"
            title="Import an Apple Music playlist"
            aria-label="Import a playlist"
          >
            <PlaylistIcon className="size-4" />
            <span className="hidden sm:inline">Playlist</span>
          </Button>
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById("file-upload")?.click()}
            className="gap-1.5 h-11 px-3.5 sm:px-4 rounded-full text-sm font-semibold"
            aria-label="Upload audio files"
          >
            {uploading ? (
              <>
                <CircleNotchIcon className="size-3.5 animate-spin" />
                {uploadProgress > 0 ? `${uploadProgress}%` : "..."}
              </>
            ) : (
              <>
                <UploadSimpleIcon className="size-4" />
                <span className="hidden sm:inline">Upload</span>
              </>
            )}
          </Button>
        </div>
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

      {/* Search + sort */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search songs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 rounded-full bg-card text-base"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-9 grid place-items-center text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>

        {/* Sort button — next to the search field rather than after the
            folders, so the folder row is nothing but folders. */}
        <div className="relative shrink-0">
          <button
            onClick={() => setSortMenuOpen(!sortMenuOpen)}
            className="flex items-center gap-1.5 h-12 px-4 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
            title="Sort"
          >
            <ArrowsDownUpIcon className="size-4" />
            <span className="hidden sm:inline">{SORT_OPTIONS.find(o => o.value === effectiveSort)?.label}</span>
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-40 bg-popover border border-border rounded-2xl shadow-lg p-1.5 min-w-[11rem]">
                {SORT_OPTIONS.filter((opt) => opt.value !== "custom" || activeFolder).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSortMode(opt.value); setSortMenuOpen(false); }}
                    className={`w-full text-left px-3 h-11 rounded-xl text-sm flex items-center gap-2 hover:bg-muted transition-colors ${
                      effectiveSort === opt.value ? "text-primary font-medium" : "text-foreground"
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

      <div className="mb-4">
        {/* What you are looking at, and what you can do to it. Its own line,
            so selecting a folder never reshuffles the row above. */}
        <div className="flex items-center gap-2 pl-0.5">
          <h2 className="text-2xl font-semibold text-foreground truncate">
            {activeFolderRecord ? activeFolderRecord.name : "All songs"}
          </h2>
          <span className="text-sm text-muted-foreground whitespace-nowrap mt-1">
            {sortedSongs.length} {sortedSongs.length === 1 ? "song" : "songs"}
          </span>
          <div className="flex-1" />
          {activeFolderRecord && (
            <>
              <button
                onClick={() => openEditFolder(activeFolderRecord)}
                className="size-10 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
                title="Rename folder"
              >
                <PencilSimpleIcon className="size-4" />
              </button>
              <button
                onClick={() => deleteFolder(activeFolderRecord.id, activeFolderRecord.name)}
                className="size-10 grid place-items-center rounded-full text-muted-foreground hover:text-destructive active:scale-90 transition-all"
                title="Delete folder"
              >
                <TrashIcon className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10 mb-4">
            <XIcon className="size-6 text-destructive" />
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
        <ul className="flex flex-col gap-2">
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
            searchQuery ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-muted mb-4">
                  <MagnifyingGlassIcon className="size-7 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold text-foreground mb-1">No matching songs</p>
                <p className="text-base text-muted-foreground">Try a different search term</p>
              </div>
            ) : (
              // Nothing here yet: show the ways in rather than a blank panel.
              <div className="py-16 max-w-lg mx-auto text-center">
                <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-muted mb-5">
                  <MusicNotesIcon className="size-7 text-loop" />
                </div>
                <p className="text-2xl font-semibold text-foreground text-balance">
                  {activeFolder ? "Build the set for this folder" : "Add your first song"}
                </p>
                <p className="mt-2 text-base text-muted-foreground text-pretty">
                  Shreddy finds the key, tempo and sections, so you can loop the hard parts straight away.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {[
                    { label: "YouTube link", hint: "Paste or search", icon: <LinkIcon className="size-6" />, onClick: () => { setYoutubeDialogOpen(true); setYoutubeError(null); setYoutubeUrl(""); setAnalyzeSections(analyzeDefault); } },
                    { label: "Playlist", hint: "Import every track", icon: <PlaylistIcon className="size-6" />, onClick: () => setPlaylistDialogOpen(true) },
                    { label: "Upload", hint: "MP3 or MP4", icon: <UploadSimpleIcon className="size-6" />, onClick: () => document.getElementById("file-upload")?.click() },
                  ].map((o) => (
                    <button
                      key={o.label}
                      onClick={o.onClick}
                      className="rounded-2xl border border-border bg-card px-3 py-4 grid justify-items-center gap-2 text-sm font-semibold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
                    >
                      <span className="text-muted-foreground">{o.icon}</span>
                      {o.label}
                      <span className="text-xs font-normal text-muted-foreground">{o.hint}</span>
                    </button>
                  ))}
                </div>
                {activeFolder && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Or swipe a song left in All songs and tap Move.
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
              {pinnedSongs.length > 0 && (
                <section>
                  <h3 className="px-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pinned</h3>
                  <ul className="flex flex-col gap-2">{pinnedSongs.map(renderSong)}</ul>
                </section>
              )}
              {unpinnedSongs.length > 0 && (
                <section>
                  {pinnedSongs.length > 0 && (
                    <h3 className="px-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Library</h3>
                  )}
                  <ul className="flex flex-col gap-2">{unpinnedSongs.map(renderSong)}</ul>
                </section>
              )}
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
                    <FolderOpenIcon className="size-4 text-muted-foreground" />
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

      <PlaylistImportDialog
        open={playlistDialogOpen}
        onOpenChange={setPlaylistDialogOpen}
        onImported={() => { fetchSongs(); fetchFolders(); }}
      />

      {/* YouTube import dialog */}
      <Dialog
        open={youtubeDialogOpen}
        onOpenChange={(open) => {
          setYoutubeDialogOpen(open);
          // The picker resets when it unmounts; drop the selection with it, or
          // reopening would import whatever was chosen last time.
          if (!open) { setYoutubeUrl(""); setYoutubeError(null); }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import from YouTube</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 min-w-0">
            <div>
              <YouTubeSearchPanel
                endpoint="/shreddy/api/youtube-search"
                selectedUrl={youtubeUrl}
                onSelect={(url) => { setYoutubeUrl(url); setYoutubeError(null); }}
                onSubmit={handleYoutubeImport}
                disabled={youtubeImporting}
                limitLabel={`over ${Math.floor(maxDuration / 60)} min`}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                For personal practice use only. Max {Math.floor(maxDuration / 60)} min.
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
                    <CircleNotchIcon className="size-4 animate-spin mr-1.5" />
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
    </AppShell>
  );
}
