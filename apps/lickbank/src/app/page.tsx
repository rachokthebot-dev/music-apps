"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AppSwitcher } from "@music-apps/shared/app-switcher";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Source {
  id: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
}

interface Folder {
  id: string;
  name: string;
  orderIndex: number;
  _count: { licks: number };
}

interface Lick {
  id: string;
  name: string;
  sourceId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  videoClipPath: string | null;
  folderId: string | null;
  createdAt: string;
  source: Source;
  folder: Folder | null;
}

interface ImportJob {
  id: string;
  sourceId: string;
  status: string;
  progressMessage: string | null;
  errorMessage: string | null;
}

interface SourceItem {
  id: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  processingStatus: string;
  durationSec: number | null;
  createdAt: string;
  _count: { licks: number };
}

type Tab = "licks" | "sources";

export default function LibraryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("licks");
  const [licks, setLicks] = useState<Lick[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

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

  // Move to folder dialog
  const [moveTarget, setMoveTarget] = useState<Lick | null>(null);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = useCallback(() => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }, [darkMode]);

  const fetchData = useCallback(async () => {
    try {
      const [licksRes, foldersRes, sourcesRes] = await Promise.all([
        fetch("/api/licks"),
        fetch("/api/folders"),
        fetch("/api/sources"),
      ]);
      if (licksRes.ok) setLicks(await licksRes.json());
      if (foldersRes.ok) setFolders(await foldersRes.json());
      if (sourcesRes.ok) setSources(await sourcesRes.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleImport = async () => {
    if (!youtubeUrl.trim()) return;
    setImporting(true);
    setImportStatus("Starting import...");
    setImportError(null);

    try {
      const res = await fetch("/api/import/youtube", {
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
          const jobRes = await fetch(`/api/jobs/${jobId}`);
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
          } else if (job.status === "failed") {
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
      const res = await fetch("/api/folders", {
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
      const res = await fetch(`/api/licks/${lick.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const handleMoveLick = async (lick: Lick, folderId: string | null) => {
    try {
      const res = await fetch(`/api/licks/${lick.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (res.ok) {
        setMoveTarget(null);
        fetchData();
      }
    } catch {
      // silently fail
    }
  };

  const filteredLicks = selectedFolder
    ? licks.filter((l) => l.folderId === selectedFolder)
    : licks;

  const selectedFolderName = selectedFolder
    ? folders.find((f) => f.id === selectedFolder)?.name
    : "All Licks";

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-muted"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <h1 className="text-xl font-bold tracking-tight">LickBank</h1>
        </div>
        <div className="flex items-center gap-2">
          <AppSwitcher currentAppId="lickbank" />
          <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </Button>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger render={<Button variant="default" />}>
              Import from YouTube
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import from YouTube</DialogTitle>
                <DialogDescription>
                  Paste a YouTube URL to download and import the video.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setYoutubeUrl(e.target.value)}
                  disabled={importing}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") handleImport();
                  }}
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
        </div>
      </header>

      {/* Tab Toggle */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card">
        <button
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === "licks"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          onClick={() => setActiveTab("licks")}
        >
          Licks
        </button>
        <button
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === "sources"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          onClick={() => setActiveTab("sources")}
        >
          Sources
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - only visible on Licks tab */}
        <aside
          className={`${
            activeTab === "sources" ? "hidden" : ""
          } ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transition-transform duration-200 flex flex-col pt-14 lg:pt-0`}
        >
          {/* Overlay for mobile */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/30 lg:hidden -z-10"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div className="p-3 border-b border-border">
            <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
              <DialogTrigger render={<Button variant="outline" className="w-full" size="sm" />}>
                + New Folder
              </DialogTrigger>
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
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            <button
              onClick={() => {
                setSelectedFolder(null);
                setSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedFolder === null
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              All Licks
              <span className="ml-auto float-right text-xs opacity-60">
                {licks.length}
              </span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => {
                  setSelectedFolder(folder.id);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedFolder === folder.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {folder.name}
                <span className="ml-auto float-right text-xs opacity-60">
                  {folder._count.licks}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {activeTab === "licks" ? (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{selectedFolderName}</h2>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : filteredLicks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <p className="text-muted-foreground">
                    {selectedFolder ? "No licks in this folder." : "No licks yet."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Import a YouTube video to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredLicks.map((lick) => (
                    <div
                      key={lick.id}
                      className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-ring transition-colors cursor-pointer"
                      onClick={() => router.push(`/licks/${lick.id}`)}
                    >
                      {/* Thumbnail */}
                      {lick.source.thumbnailUrl && (
                        <div className="aspect-video bg-muted overflow-hidden">
                          <img
                            src={lick.source.thumbnailUrl}
                            alt={lick.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                            {formatTime(lick.durationSec)}
                          </div>
                        </div>
                      )}
                      {!lick.source.thumbnailUrl && (
                        <div className="aspect-video bg-muted flex items-center justify-center">
                          <span className="text-muted-foreground text-sm">No thumbnail</span>
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                            {formatTime(lick.durationSec)}
                          </div>
                        </div>
                      )}

                      <div className="p-3">
                        <h3 className="font-medium text-sm truncate">{lick.name}</h3>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {lick.source.title}
                        </p>
                        {lick.folder && (
                          <span className="inline-block mt-1.5 text-xs bg-muted px-2 py-0.5 rounded-full">
                            {lick.folder.name}
                          </span>
                        )}
                      </div>

                      {/* Quick actions (stop propagation to prevent navigation) */}
                      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="p-1.5 rounded-lg bg-card/90 border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Move to folder"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveTarget(lick);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </button>
                        <button
                          className="p-1.5 rounded-lg bg-card/90 border border-border hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(lick);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Sources Tab */
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Imported Videos</h2>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <p className="text-muted-foreground">No videos imported yet.</p>
                  <p className="text-sm text-muted-foreground">
                    Import a YouTube video to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {sources.map((source) => {
                    const isReady = source.processingStatus === "ready";
                    const isError = source.processingStatus === "error";
                    const isProcessing = source.processingStatus === "processing" || source.processingStatus === "pending";
                    return (
                      <div
                        key={source.id}
                        className={`group relative bg-card border border-border rounded-xl overflow-hidden transition-colors ${
                          isReady ? "hover:border-ring cursor-pointer" : "opacity-60"
                        }`}
                        onClick={() => isReady && router.push(`/sources/${source.id}`)}
                      >
                        {/* Thumbnail */}
                        {source.thumbnailUrl ? (
                          <div className="aspect-video bg-muted overflow-hidden relative">
                            <img
                              src={source.thumbnailUrl}
                              alt={source.title}
                              className="w-full h-full object-cover"
                            />
                            {source.durationSec && (
                              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                {formatTime(source.durationSec)}
                              </div>
                            )}
                            {/* Status badge */}
                            {isProcessing && (
                              <div className="absolute top-2 left-2 bg-amber-500/90 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                                </svg>
                                Processing
                              </div>
                            )}
                            {isError && (
                              <div className="absolute top-2 left-2 bg-destructive/90 text-white text-xs px-2 py-0.5 rounded">
                                Error
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="aspect-video bg-muted flex items-center justify-center">
                            <span className="text-muted-foreground text-sm">No thumbnail</span>
                          </div>
                        )}

                        <div className="p-3">
                          <h3 className="font-medium text-sm truncate">{source.title}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {source._count.licks} {source._count.licks === 1 ? "lick" : "licks"}
                            </span>
                            {source.artist && (
                              <>
                                <span className="text-xs text-border">|</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {source.artist}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>

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

      {/* Move to folder dialog */}
      <Dialog open={moveTarget !== null} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              Select a folder for &ldquo;{moveTarget?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            <button
              className={`text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${
                moveTarget?.folderId === null ? "bg-muted font-medium" : ""
              }`}
              onClick={() => moveTarget && handleMoveLick(moveTarget, null)}
            >
              No Folder
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                className={`text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${
                  moveTarget?.folderId === folder.id ? "bg-muted font-medium" : ""
                }`}
                onClick={() => moveTarget && handleMoveLick(moveTarget, folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
