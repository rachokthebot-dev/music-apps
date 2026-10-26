"use client";

import { Suspense, useState, useCallback } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@music-apps/ui";
import { AppShell, SidebarItem, SidebarMenuButton, SidebarSection } from "@music-apps/shared/app-shell";
import { YouTubeSearchPanel } from "@music-apps/shared/youtube-search-panel";
import {
  ArrowSquareOutIcon,
  ClockCounterClockwiseIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderSimpleIcon,
  GuitarIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlayIcon,
  TrashIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react";
import { SongCard, type SongCardLick } from "@/components/SongCard";
import { SwipeRow } from "@/components/SwipeRow";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface Source {
  id: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
}

interface Folder {
  id: string;
  name: string;
  orderIndex: number;
  _count: { lickFolders: number; sourceFolders: number };
}

interface Lick {
  id: string;
  name: string;
  sourceId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  lastTempo: number;
  lastPracticedAt: string | null;
  folders: { folderId: string; folder: { id: string; name: string } }[];
  createdAt: string;
  source: Source;
}

interface SourceItem {
  id: string;
  title: string;
  artist: string | null;
  youtubeUrl: string;
  thumbnailUrl: string | null;
  processingStatus: string;
  durationSec: number | null;
  createdAt: string;
  _count: { licks: number };
  folders: { folderId: string; folder: { id: string; name: string } }[];
}

interface ImportJob {
  id: string;
  sourceId: string;
  status: string;
  progressMessage: string | null;
  errorMessage: string | null;
}

type Tab = "licks" | "sources";

/** Sidebar pseudo-folder: licks practised in the last two weeks. */
const RECENT = "recent";
const RECENT_DAYS = 14;

// Folders wear a dot in a fixed colour by their order.

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LibraryPageWrapper() {
  return (
    <Suspense>
      <LibraryPage />
    </Suspense>
  );
}

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
});

function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(searchParams.get("tab") === "sources" ? "sources" : "licks");
  const { data: licks = [], mutate: mutateLicks, isLoading: licksLoading } = useSWR<Lick[]>("/lickbank/api/licks", fetcher);
  const { data: folders = [], mutate: mutateFolders } = useSWR<Folder[]>("/lickbank/api/folders", fetcher);
  const { data: sources = [], mutate: mutateSources } = useSWR<SourceItem[]>("/lickbank/api/sources", fetcher);
  const loading = licksLoading;
  const [selectedFolder, _setSelectedFolder] = useState<string | null>(searchParams.get("folder"));

  const setSelectedFolder = useCallback((folderId: string | null) => {
    _setSelectedFolder(folderId);
    const params = new URLSearchParams();
    if (folderId) params.set("folder", folderId);
    if (activeTab !== "licks") params.set("tab", activeTab);
    const qs = params.toString();
    // Relative to the current path, so the /lickbank basePath survives a reload.
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState("");


  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Create folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<Lick | null>(null);

  // Folders dialog (multi-select) — works for both Lick and Source
  type MoveTarget =
    | { kind: "lick"; lick: Lick }
    | { kind: "source"; source: SourceItem };
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  // Mobile sidebar

  // Rename source/lick
  const [renamingSource, setRenamingSource] = useState<SourceItem | null>(null);
  const [renamingLick, setRenamingLick] = useState<Lick | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Swipe actions (one open song row at a time) and the lick action sheet
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [lickMenu, setLickMenu] = useState<Lick | null>(null);

  // Import to Shreddy
  const [shreddyImporting, setShreddyImporting] = useState<string | null>(null);
  const [shreddyMessage, setShreddyMessage] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null);


  const fetchData = useCallback(() => {
    mutateLicks();
    mutateFolders();
    mutateSources();
  }, [mutateLicks, mutateFolders, mutateSources]);

  const handleImport = async () => {
    if (!youtubeUrl.trim()) return;
    setImporting(true);
    setImportStatus("Starting import...");
    setImportError(null);

    try {
      const res = await fetch("/lickbank/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Import failed");
        setImporting(false);
        return;
      }

      const jobId = data.importJob?.id;
      if (!jobId) {
        // Already exists and is ready
        setImportStatus("Source already imported!");
        setImporting(false);
        if (data.source?.id) {
          router.push(`/sources/${data.source.id}`);
        }
        return;
      }

      // Poll job status
      const poll = setInterval(async () => {
        try {
          const jobRes = await fetch(`/lickbank/api/jobs/${jobId}`);
          if (!jobRes.ok) return;
          const job: ImportJob = await jobRes.json();
          setImportStatus(job.progressMessage || job.status);

          if (job.status === "completed") {
            clearInterval(poll);
            setImporting(false);
            setImportOpen(false);
            setYoutubeUrl("");
            setImportStatus(null);
            router.push(`/sources/${job.sourceId}`);
          } else if (job.status === "error") {
            clearInterval(poll);
            setImportError(job.errorMessage || "Import failed");
            setImporting(false);
          }
        } catch {
          // continue polling
        }
      }, 1500);
    } catch {
      setImportError("Network error");
      setImporting(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/lickbank/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (res.ok) {
        setNewFolderName("");
        setFolderDialogOpen(false);
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const handleDeleteLick = async (lick: Lick) => {
    try {
      const res = await fetch(`/lickbank/api/licks/${lick.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const openFoldersForLick = (lick: Lick) => {
    setMoveTarget({ kind: "lick", lick });
    setSelectedFolderIds(new Set(lick.folders.map((f) => f.folderId)));
  };

  const openFoldersForSource = (source: SourceItem) => {
    setMoveTarget({ kind: "source", source });
    setSelectedFolderIds(new Set(source.folders.map((f) => f.folderId)));
  };

  const toggleSelectedFolder = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const saveMoveTarget = async () => {
    if (!moveTarget) return;
    const folderIds = Array.from(selectedFolderIds);
    const url = moveTarget.kind === "lick"
      ? `/lickbank/api/licks/${moveTarget.lick.id}`
      : `/lickbank/api/sources/${moveTarget.source.id}`;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds }),
      });
      if (res.ok) {
        setMoveTarget(null);
        setSelectedFolderIds(new Set());
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const handleRenameSource = async () => {
    if (!renamingSource || !renameValue.trim()) return;
    try {
      const res = await fetch(`/lickbank/api/sources/${renamingSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (res.ok) {
        setRenamingSource(null);
        setRenameValue("");
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const handleRenameLick = async () => {
    if (!renamingLick || !renameValue.trim()) return;
    try {
      const res = await fetch(`/lickbank/api/licks/${renamingLick.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        setRenamingLick(null);
        setRenameValue("");
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const handleImportToShreddy = async (source: SourceItem) => {
    if (!source.youtubeUrl) return;
    setShreddyImporting(source.id);
    setShreddyMessage(null);
    try {
      const shreddyPort = 3000;
      const res = await fetch(`http://${window.location.hostname}:${shreddyPort}/api/import/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.youtubeUrl }),
      });
      if (res.ok) {
        setShreddyMessage({ id: source.id, type: "success", text: "Sent to Shreddy!" });
      } else {
        const data = await res.json().catch(() => ({}));
        setShreddyMessage({ id: source.id, type: "error", text: data.error || "Failed" });
      }
    } catch {
      setShreddyMessage({ id: source.id, type: "error", text: "Could not reach Shreddy" });
    } finally {
      setShreddyImporting(null);
      setTimeout(() => setShreddyMessage(null), 3000);
    }
  };

  const searchLower = searchQuery.toLowerCase();
  const recentCutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const practicedAt = (l: Lick) => (l.lastPracticedAt ? new Date(l.lastPracticedAt).getTime() : 0);
  const recentLicks = licks.filter((l) => practicedAt(l) >= recentCutoff);

  const filteredLicks = licks.filter((l) => {
    if (selectedFolder === RECENT) {
      if (practicedAt(l) < recentCutoff) return false;
    } else if (selectedFolder && !l.folders.some((f) => f.folderId === selectedFolder)) return false;
    if (searchQuery && !l.name.toLowerCase().includes(searchLower) && !l.source.title.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  const filteredSources = sources.filter((s) => {
    if (selectedFolder && !s.folders.some((f) => f.folderId === selectedFolder)) return false;
    if (searchQuery && !s.title.toLowerCase().includes(searchLower) && !(s.artist ?? "").toLowerCase().includes(searchLower)) return false;
    return true;
  });

  // Every song's licks in song order — the strip on each card shows them all.
  const licksBySource = new Map<string, Lick[]>();
  for (const l of licks) {
    const list = licksBySource.get(l.sourceId) ?? [];
    list.push(l);
    licksBySource.set(l.sourceId, list);
  }
  for (const list of licksBySource.values()) list.sort((a, b) => a.startSec - b.startSec);

  // The Licks tab groups matching licks by song: newest lick first, or most
  // recently practised in Recent.
  const songGroups: { source: Source; visible: Set<string> }[] = [];
  const groupIndex = new Map<string, number>();
  const ordered = selectedFolder === RECENT
    ? [...filteredLicks].sort((a, b) => practicedAt(b) - practicedAt(a))
    : filteredLicks;
  for (const l of ordered) {
    let i = groupIndex.get(l.sourceId);
    if (i === undefined) {
      i = songGroups.length;
      groupIndex.set(l.sourceId, i);
      songGroups.push({ source: l.source, visible: new Set() });
    }
    songGroups[i].visible.add(l.id);
  }

  // The last lick practised, for the Continue card.
  const continueLick = licks.reduce<Lick | null>(
    (best, l) => (practicedAt(l) > (best ? practicedAt(best) : 0) ? l : best),
    null
  );
  const showContinue = activeTab === "licks" && !selectedFolder && !searchQuery && continueLick;

  const folderName = selectedFolder === RECENT
    ? "Recent"
    : selectedFolder
      ? folders.find((f) => f.id === selectedFolder)?.name ?? "Folder"
      : activeTab === "licks" ? "All licks" : "All songs";
  const shownCount = activeTab === "licks" ? filteredLicks.length : filteredSources.length;

  const openLickMenu = (cardLick: SongCardLick) => {
    const lick = licks.find((l) => l.id === cardLick.id);
    if (lick) setLickMenu(lick);
  };

  const songActions = (source: SourceItem | undefined, fallback: Source) => [
    {
      label: "Rename",
      icon: <PencilSimpleIcon className="size-5" />,
      className: "bg-zinc-500",
      onSelect: () => {
        if (!source) return;
        setRenamingSource(source);
        setRenameValue(source.title);
      },
    },
    {
      label: "Folders",
      icon: <FolderSimpleIcon className="size-5" />,
      className: "bg-blue-500",
      onSelect: () => source && openFoldersForSource(source),
    },
    {
      label: shreddyImporting === fallback.id ? "Sending" : "Shreddy",
      icon: <PaperPlaneTiltIcon className="size-5" />,
      className: "bg-violet-500",
      onSelect: () => source && handleImportToShreddy(source),
    },
    ...(source?.youtubeUrl
      ? [{
          label: "YouTube",
          icon: <ArrowSquareOutIcon className="size-5" />,
          className: "bg-red-500",
          onSelect: () => window.open(source.youtubeUrl, "_blank", "noopener"),
        }]
      : []),
  ];


  const emptyState = (() => {
    if (searchQuery) {
      return {
        title: `No matches for “${searchQuery}”`,
        body: "Search looks at lick names and song titles.",
        action: <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setSearchQuery("")}>Clear search</Button>,
      };
    }
    if (selectedFolder === RECENT) {
      return {
        title: "Nothing practised lately",
        body: `Licks you play show up here for ${RECENT_DAYS} days.`,
        action: <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setSelectedFolder(null)}>Browse all licks</Button>,
      };
    }
    if (selectedFolder) {
      return {
        title: `Nothing in ${folderName} yet`,
        body: activeTab === "licks"
          ? "Press and hold a lick, then choose Folders to add it here."
          : "Swipe a song left and choose Folders to add it here.",
        action: <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setSelectedFolder(null)}>Browse everything</Button>,
      };
    }
    return {
      title: activeTab === "licks" ? "No licks yet" : "No songs yet",
      body: "Import a YouTube lesson, then tap its sections to cut licks.",
      action: (
        <Button className="h-11 rounded-full px-5 gap-2" onClick={() => setImportOpen(true)}>
          <YoutubeLogoIcon className="size-5" weight="fill" />
          Import from YouTube
        </Button>
      ),
    };
  })();

  return (
    <AppShell
      appId="lickbank"
      title="LickBank"
      sidebar={
        <>
            <div className="grid grid-cols-2 p-1 mb-3 rounded-2xl bg-muted" role="tablist">
              {(["licks", "sources"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`h-10 rounded-xl text-sm font-semibold transition-all duration-300 ease-spring ${
                    activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setActiveTab(tab);
                    setSearchQuery("");
                    if (selectedFolder === RECENT) setSelectedFolder(null);
                  }}
                >
                  {tab === "licks" ? "Licks" : "Songs"}
                </button>
              ))}
            </div>
          <SidebarItem
            active={selectedFolder === null}
            icon={<GuitarIcon className="size-5" />}
            label={activeTab === "licks" ? "All licks" : "All songs"}
            count={activeTab === "licks" ? licks.length : sources.length}
            onClick={() => setSelectedFolder(null)}
          />
          {activeTab === "licks" && (
            <SidebarItem
              active={selectedFolder === RECENT}
              icon={<ClockCounterClockwiseIcon className="size-5" />}
              label="Recent"
              count={recentLicks.length}
              onClick={() => setSelectedFolder(RECENT)}
            />
          )}

          <SidebarSection label="Folders" onAdd={() => setFolderDialogOpen(true)} addLabel="New folder" />
          {folders
            // In the Songs tab, only show folders that actually contain songs —
            // lick-only folders (0 songs) just duplicate song names and clutter.
            .filter((folder) =>
              activeTab === "licks" ? true : folder._count.sourceFolders > 0
            )
            .map((folder) => (
              <SidebarItem
                key={folder.id}
                active={selectedFolder === folder.id}
                icon={selectedFolder === folder.id ? <FolderOpenIcon className="size-5" /> : <FolderIcon className="size-5" />}
                label={folder.name}
                count={activeTab === "licks" ? folder._count.lickFolders : folder._count.sourceFolders}
                onClick={() => setSelectedFolder(folder.id)}
              />
            ))}
        </>
      }
    >
      {/* Main content */}
      <main>
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 space-y-5">
          <div className="flex items-center gap-3">
            <SidebarMenuButton />
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder={activeTab === "licks" ? "Search licks and songs" : "Search songs"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-4 rounded-full bg-card border border-border text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              className="h-12 shrink-0 px-5 rounded-full bg-primary text-primary-foreground flex items-center gap-2 text-sm font-semibold active:scale-95 transition-all duration-200 ease-spring"
              onClick={() => setImportOpen(true)}
            >
              <YoutubeLogoIcon className="size-5" weight="fill" />
              <span className="hidden sm:inline">Import from YouTube</span>
              <span className="sm:hidden">Import</span>
            </button>
          </div>

          <ErrorBoundary>
          {showContinue && continueLick && (
            <button
              className="w-full flex items-center gap-4 p-4 rounded-3xl bg-card border border-border text-left active:scale-[0.99] transition-transform duration-300 ease-spring"
              onClick={() => router.push(`/licks/${continueLick.id}`)}
            >
              <div className="w-36 md:w-56 shrink-0 aspect-video rounded-2xl overflow-hidden bg-muted">
                {continueLick.source.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={continueLick.source.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-loop">Continue</p>
                <p className="text-xl md:text-2xl font-semibold tracking-tight truncate mt-1">{continueLick.name}</p>
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {[
                    continueLick.source.title,
                    continueLick.source.artist,
                    `${formatTime(continueLick.startSec)} to ${formatTime(continueLick.endSec)}`,
                    continueLick.lastTempo !== 1 ? `at ${continueLick.lastTempo}×` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="size-16 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg">
                <PlayIcon className="size-7 translate-x-0.5" weight="fill" />
              </span>
            </button>
          )}

          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{folderName}</h2>
            <span className="text-sm text-muted-foreground">
              {shownCount} {activeTab === "licks" ? (shownCount === 1 ? "lick" : "licks") : (shownCount === 1 ? "song" : "songs")}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-4 p-4 rounded-3xl bg-card">
                  <div className="w-32 md:w-44 aspect-video rounded-xl bg-muted animate-pulse" />
                  <div className="flex-1 space-y-3 pt-1">
                    <div className="h-5 w-1/3 rounded-full bg-muted animate-pulse" />
                    <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
                    <div className="flex gap-2">
                      <div className="h-11 w-28 rounded-xl bg-muted animate-pulse" />
                      <div className="h-11 w-24 rounded-xl bg-muted animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : shownCount === 0 ? (
            <div className="flex flex-col items-center text-center py-16 px-6 rounded-3xl border border-dashed border-border">
              <GuitarIcon className="size-10 text-muted-foreground" />
              <p className="text-lg font-semibold mt-4">{emptyState.title}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">{emptyState.body}</p>
              <div className="mt-5">{emptyState.action}</div>
            </div>
          ) : (
            <ul className="space-y-3">
              {(activeTab === "licks"
                ? songGroups.map((g) => ({ source: g.source, item: sources.find((s) => s.id === g.source.id), visible: g.visible }))
                : filteredSources.map((s) => ({ source: s as Source, item: s, visible: undefined }))
              ).map(({ source, item, visible }) => {
                const songLicks = licksBySource.get(source.id) ?? [];
                const meta = visible && visible.size !== songLicks.length
                  ? `${visible.size} of ${songLicks.length} licks`
                  : `${songLicks.length} ${songLicks.length === 1 ? "lick" : "licks"}`;
                return (
                  <SwipeRow
                    key={source.id}
                    className="rounded-3xl border border-border"
                    actions={item?.processingStatus === "ready" || !item ? songActions(item, source) : []}
                    open={swipedId === source.id}
                    onOpenChange={(open) => setSwipedId(open ? source.id : null)}
                  >
                    <SongCard
                      song={{ ...source, processingStatus: item?.processingStatus }}
                      licks={songLicks}
                      visibleIds={visible}
                      meta={meta}
                      onOpenSong={() => router.push(`/sources/${source.id}`)}
                      onOpenLick={(l) => router.push(`/licks/${l.id}`)}
                      onLickMenu={openLickMenu}
                    />
                  </SwipeRow>
                );
              })}
            </ul>
          )}
          </ErrorBoundary>
        </div>
      </main>

      {/* Toast for Send to Shreddy */}
      {shreddyMessage && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 h-12 rounded-full flex items-center text-sm font-semibold shadow-2xl ${
          shreddyMessage.type === "success" ? "bg-primary text-primary-foreground" : "bg-destructive text-white"
        }`}>
          {shreddyMessage.text}
        </div>
      )}

      {/* Lick actions — opened by holding a lick chip */}
      <Dialog open={lickMenu !== null} onOpenChange={(open) => !open && setLickMenu(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{lickMenu?.name}</DialogTitle>
            <DialogDescription>{lickMenu?.source.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {lickMenu && [
              { label: "Rename", icon: <PencilSimpleIcon className="size-5" />, run: () => { setRenamingLick(lickMenu); setRenameValue(lickMenu.name); } },
              { label: "Folders", icon: <FolderSimpleIcon className="size-5" />, run: () => openFoldersForLick(lickMenu) },
              { label: "Open song", icon: <ArrowSquareOutIcon className="size-5" />, run: () => router.push(`/sources/${lickMenu.sourceId}`) },
              { label: "Delete", icon: <TrashIcon className="size-5" />, run: () => setDeleteTarget(lickMenu), danger: true },
            ].map((a) => (
              <button
                key={a.label}
                className={`h-12 px-4 rounded-xl flex items-center gap-3 text-base font-medium bg-muted hover:bg-accent active:scale-[0.98] transition-all ${
                  a.danger ? "text-destructive" : ""
                }`}
                onClick={() => { setLickMenu(null); a.run(); }}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from YouTube */}
      <Dialog
        open={importOpen}
        onOpenChange={(open: boolean) => {
          setImportOpen(open);
          // The picker resets when it unmounts; drop the selection with it,
          // or reopening would import whatever was chosen last time.
          if (!open) { setYoutubeUrl(""); setImportError(null); setImportStatus(null); }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import from YouTube</DialogTitle>
            <DialogDescription>
              Search for a lesson video, or paste a YouTube URL directly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 min-w-0">
            <YouTubeSearchPanel
              endpoint="/lickbank/api/youtube-search"
              selectedUrl={youtubeUrl}
              onSelect={setYoutubeUrl}
              onSubmit={handleImport}
              disabled={importing}
            />
            {importStatus && (
              <p className="text-sm text-muted-foreground">{importStatus}</p>
            )}
            {importError && (
              <p className="text-sm text-destructive">{importError}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleImport} disabled={importing || !youtubeUrl.trim()}>
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create folder */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleCreateFolder();
            }}
          />
          <DialogFooter>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lick</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDeleteLick(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename source dialog */}
      <Dialog open={renamingSource !== null} onOpenChange={(open) => { if (!open) setRenamingSource(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Song</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New title"
            value={renameValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleRenameSource();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenamingSource(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSource} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename lick dialog */}
      <Dialog open={renamingLick !== null} onOpenChange={(open) => { if (!open) setRenamingLick(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Lick</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New name"
            value={renameValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleRenameLick();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenamingLick(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameLick} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folders dialog (multi-select) */}
      <Dialog open={moveTarget !== null} onOpenChange={(open) => { if (!open) { setMoveTarget(null); setSelectedFolderIds(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Folders</DialogTitle>
            <DialogDescription>
              {moveTarget?.kind === "lick"
                ? `Choose folders for "${moveTarget.lick.name}"`
                : moveTarget?.kind === "source"
                ? `Choose folders for "${moveTarget.source.title}"`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            {folders.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No folders yet. Create one from the sidebar.
              </p>
            ) : (
              folders.map((folder) => {
                const checked = selectedFolderIds.has(folder.id);
                return (
                  <label
                    key={folder.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-sm cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectedFolder(folder.id)}
                      className="size-4 rounded"
                    />
                    <span className="flex-1">{folder.name}</span>
                  </label>
                );
              })
            )}
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">
              Leave all unchecked to keep this {moveTarget?.kind === "lick" ? "lick" : "song"} unfiled.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMoveTarget(null); setSelectedFolderIds(new Set()); }}>
              Cancel
            </Button>
            <Button onClick={saveMoveTarget}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
