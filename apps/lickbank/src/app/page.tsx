"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { LickCard } from "@/components/LickCard";
import { SourceCard } from "@/components/SourceCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { Lick, Source, Folder } from "@/components/LickCard";
import type { SourceItem } from "@/components/SourceCard";

interface ImportJob {
  id: string;
  sourceId: string;
  status: string;
  progressMessage: string | null;
  errorMessage: string | null;
}

type Tab = "licks" | "sources";

// Color-code licks by source song
const SOURCE_COLORS = [
  "border-l-blue-500", "border-l-emerald-500", "border-l-amber-500",
  "border-l-rose-500", "border-l-violet-500", "border-l-cyan-500",
  "border-l-orange-500", "border-l-pink-500", "border-l-teal-500", "border-l-indigo-500",
];

function buildColorMaps(licks: Lick[], folders: Folder[]) {
  const sourceColorMap = new Map<string, string>();
  const sourcesWithMultipleLicks = new Set<string>();
  const sourceCountMap = new Map<string, number>();

  for (const l of licks) {
    sourceCountMap.set(l.sourceId, (sourceCountMap.get(l.sourceId) ?? 0) + 1);
  }
  for (const [sid, count] of sourceCountMap) {
    if (count > 1) sourcesWithMultipleLicks.add(sid);
  }
  let colorIdx = 0;
  for (const l of licks) {
    if (sourcesWithMultipleLicks.has(l.sourceId) && !sourceColorMap.has(l.sourceId)) {
      sourceColorMap.set(l.sourceId, SOURCE_COLORS[colorIdx % SOURCE_COLORS.length]);
      colorIdx++;
    }
  }

  const folderColorMap = new Map<string, string>();
  for (const folder of folders) {
    const folderLicks = licks.filter((l) => l.folderId === folder.id);
    const srcCounts = new Map<string, number>();
    for (const l of folderLicks) {
      srcCounts.set(l.sourceId, (srcCounts.get(l.sourceId) ?? 0) + 1);
    }
    let maxCount = 0;
    let dominantSrc = "";
    for (const [sid, count] of srcCounts) {
      if (count > maxCount) { maxCount = count; dominantSrc = sid; }
    }
    if (dominantSrc && sourceColorMap.has(dominantSrc)) {
      folderColorMap.set(folder.id, sourceColorMap.get(dominantSrc)!);
    }
  }

  return { sourceColorMap, folderColorMap };
}

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
  const [activeTab, setActiveTab] = useState<Tab>(searchParams.get("tab") === "sources" ? "sources" : "licks");
  const [licks, setLicks] = useState<Lick[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedFolder, _setSelectedFolder] = useState<string | null>(searchParams.get("folder"));

  const setSelectedFolder = useCallback((folderId: string | null) => {
    _setSelectedFolder(folderId);
    const params = new URLSearchParams();
    if (folderId) params.set("folder", folderId);
    if (activeTab !== "licks") params.set("tab", activeTab);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [activeTab]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Three-dot menus
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openSourceMenuId, setOpenSourceMenuId] = useState<string | null>(null);

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

  // Rename source/lick
  const [renamingSource, setRenamingSource] = useState<SourceItem | null>(null);
  const [renamingLick, setRenamingLick] = useState<Lick | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Import to Shreddy
  const [shreddyImporting, setShreddyImporting] = useState<string | null>(null);
  const [shreddyMessage, setShreddyMessage] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDarkMode(isDark);
  }, []);

  // Close three-dot menus on outside click
  useEffect(() => {
    if (!openMenuId && !openSourceMenuId) return;
    function handleClick() { setOpenMenuId(null); setOpenSourceMenuId(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenuId, openSourceMenuId]);

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

  const handleRenameSource = async () => {
    if (!renamingSource || !renameValue.trim()) return;
    try {
      const res = await fetch(`/api/sources/${renamingSource.id}`, {
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
      const res = await fetch(`/api/licks/${renamingLick.id}`, {
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
  const filteredLicks = licks.filter((l) => {
    if (selectedFolder && l.folderId !== selectedFolder) return false;
    if (searchQuery && !l.name.toLowerCase().includes(searchLower) && !l.source.title.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  const filteredSources = sources.filter((s) => {
    if (searchQuery && !s.title.toLowerCase().includes(searchLower) && !(s.artist ?? "").toLowerCase().includes(searchLower)) return false;
    return true;
  });

  const selectedFolderName = selectedFolder
    ? folders.find((f) => f.id === selectedFolder)?.name
    : "All Licks";

  const { sourceColorMap, folderColorMap } = buildColorMaps(licks, folders);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
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
          <div className="flex items-center gap-1 ml-2">
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeTab === "licks"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              onClick={() => { setActiveTab("licks"); setSearchQuery(""); }}
            >
              Licks
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeTab === "sources"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              onClick={() => { setActiveTab("sources"); setSearchQuery(""); }}
            >
              Songs
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <AppSwitcher currentAppId="lickbank" />
        </div>
      </header>


      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
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
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder={activeTab === "licks" ? "Search licks..." : "Search songs..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          {activeTab === "licks" && (
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
          )}
          <nav className="flex-1 overflow-y-auto p-2">
            {activeTab === "licks" ? (
              <>
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
                {folders.map((folder) => {
                  const fColor = folderColorMap.get(folder.id);
                  return (
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
                      } ${fColor && selectedFolder !== folder.id ? `border-l-2 ${fColor}` : ""}`}
                    >
                      {folder.name}
                      <span className="ml-auto float-right text-xs opacity-60">
                        {folder._count.licks}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {sources.map((source) => {
                  const color = sourceColorMap.get(source.id);
                  return (
                    <button
                      key={source.id}
                      onClick={() => router.push(`/sources/${source.id}`)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted truncate ${
                        color ? `border-l-2 ${color}` : ""
                      }`}
                    >
                      <span className="font-medium truncate block">{source.title}</span>
                      <span className="text-xs text-muted-foreground">{source._count.licks} licks</span>
                    </button>
                  );
                })}
              </>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>
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
                    <LickCard
                      key={lick.id}
                      lick={lick}
                      colorClass={sourceColorMap.get(lick.sourceId)}
                      isMenuOpen={openMenuId === lick.id}
                      onMenuToggle={() => setOpenMenuId(openMenuId === lick.id ? null : lick.id)}
                      onRename={() => {
                        setRenamingLick(lick);
                        setRenameValue(lick.name);
                        setOpenMenuId(null);
                      }}
                      onMove={() => {
                        setMoveTarget(lick);
                        setOpenMenuId(null);
                      }}
                      onDelete={() => {
                        setDeleteTarget(lick);
                        setOpenMenuId(null);
                      }}
                      onClick={() => router.push(`/licks/${lick.id}`)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Sources Tab */
            <>
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : filteredSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <p className="text-muted-foreground">No songs imported yet.</p>
                  <p className="text-sm text-muted-foreground">
                    Import a YouTube video to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredSources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      colorClass={sourceColorMap.get(source.id)}
                      isMenuOpen={openSourceMenuId === source.id}
                      onMenuToggle={() => setOpenSourceMenuId(openSourceMenuId === source.id ? null : source.id)}
                      onRename={() => {
                        setRenamingSource(source);
                        setRenameValue(source.title);
                        setOpenSourceMenuId(null);
                      }}
                      onImportToShreddy={() => {
                        handleImportToShreddy(source);
                        setOpenSourceMenuId(null);
                      }}
                      shreddyImporting={shreddyImporting === source.id}
                      shreddyMessage={shreddyMessage?.id === source.id ? shreddyMessage : null}
                      onClick={() => router.push(`/sources/${source.id}`)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          </ErrorBoundary>
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
