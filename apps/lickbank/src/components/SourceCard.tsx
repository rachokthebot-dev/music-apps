"use client";

import { ThreeDotMenu } from "./ThreeDotMenu";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SourceFolderRef {
  folderId: string;
  folder: { id: string; name: string };
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
  folders: SourceFolderRef[];
}

interface SourceCardProps {
  source: SourceItem;
  colorClass?: string;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onRename: () => void;
  onMoveFolders: () => void;
  onImportToShreddy: () => void;
  shreddyImporting: boolean;
  shreddyMessage: { type: string; text: string } | null;
  onClick: () => void;
}

export type { SourceItem };

export function SourceCard({
  source,
  colorClass,
  isMenuOpen,
  onMenuToggle,
  onRename,
  onMoveFolders,
  onImportToShreddy,
  shreddyImporting,
  shreddyMessage,
  onClick,
}: SourceCardProps) {
  const isReady = source.processingStatus === "ready";
  const isError = source.processingStatus === "error";
  const isProcessing = source.processingStatus === "processing" || source.processingStatus === "pending";

  const menuItems = [
    { label: "Rename", onClick: onRename },
    { label: "Folders", onClick: onMoveFolders },
    {
      label: shreddyImporting ? "Sending..." : shreddyMessage ? shreddyMessage.text : "Send to Shreddy",
      onClick: onImportToShreddy,
      disabled: shreddyImporting,
    },
    ...(source.youtubeUrl
      ? [{ label: "Open on YouTube", onClick: () => {}, href: source.youtubeUrl }]
      : []),
  ];

  return (
    <div
      className={`group relative bg-card rounded-xl transition-colors ${
        isReady ? "hover:bg-muted/50 cursor-pointer" : "opacity-60"
      } ${colorClass ? `border-l-2 ${colorClass}` : ""}`}
      onClick={() => isReady && onClick()}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden rounded-xl">
        {source.thumbnailUrl ? (
          <img
            src={source.thumbnailUrl}
            alt={source.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No thumbnail</span>
          </div>
        )}
        {source.durationSec && (
          <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
            {formatTime(source.durationSec)}
          </div>
        )}
        {isProcessing && (
          <div className="absolute top-1.5 left-1.5 bg-amber-500/90 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            Processing
          </div>
        )}
        {isError && (
          <div className="absolute top-1.5 left-1.5 bg-destructive/90 text-white text-xs px-2 py-0.5 rounded">
            Error
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="flex items-start gap-2 px-1 pt-2 pb-1">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{source.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {source._count.licks} {source._count.licks === 1 ? "lick" : "licks"}
            {source.artist && ` · ${source.artist}`}
          </p>
          {source.folders.length > 0 && (
            <span className="inline-flex flex-wrap gap-1 mt-1">
              {source.folders.map((f) => (
                <span key={f.folderId} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">
                  {f.folder.name}
                </span>
              ))}
            </span>
          )}
        </div>

        {isReady && (
          <ThreeDotMenu
            isOpen={isMenuOpen}
            onToggle={onMenuToggle}
            items={menuItems}
          />
        )}
      </div>
    </div>
  );
}
