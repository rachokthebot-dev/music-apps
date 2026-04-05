"use client";

import { ThreeDotMenu } from "./ThreeDotMenu";

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

interface LickCardProps {
  lick: Lick;
  colorClass?: string;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClick: () => void;
}

export type { Lick, Source, Folder };

export function LickCard({
  lick,
  colorClass,
  isMenuOpen,
  onMenuToggle,
  onRename,
  onMove,
  onDelete,
  onClick,
}: LickCardProps) {
  return (
    <div
      className={`group relative bg-card rounded-xl hover:bg-muted/50 transition-colors cursor-pointer ${
        colorClass ? `border-l-2 ${colorClass}` : ""
      }`}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden rounded-xl">
        {lick.source.thumbnailUrl ? (
          <img
            src={lick.source.thumbnailUrl}
            alt={lick.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No thumbnail</span>
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
          {formatTime(lick.durationSec)}
        </div>
      </div>

      {/* Info row */}
      <div className="flex items-start gap-2 px-1 pt-2 pb-1">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{lick.name}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {lick.source.title}
          </p>
          {lick.folder && (
            <span className="inline-block mt-1 text-[11px] bg-muted px-1.5 py-0.5 rounded">
              {lick.folder.name}
            </span>
          )}
        </div>

        <ThreeDotMenu
          isOpen={isMenuOpen}
          onToggle={onMenuToggle}
          items={[
            { label: "Rename", onClick: onRename },
            { label: "Move to folder", onClick: onMove },
            { label: "Delete", onClick: onDelete, className: "text-rose-400" },
          ]}
        />
      </div>
    </div>
  );
}
