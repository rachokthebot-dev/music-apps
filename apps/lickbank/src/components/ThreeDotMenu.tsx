"use client";

import { ReactNode } from "react";

interface MenuItem {
  label: string | ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  href?: string;
}

interface ThreeDotMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  items: MenuItem[];
}

export function ThreeDotMenu({ isOpen, onToggle, items }: ThreeDotMenuProps) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted-foreground/15 text-muted-foreground transition-colors"
        aria-label="Open menu"
        onClick={onToggle}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-12 w-48 bg-card border border-border rounded-lg shadow-lg shadow-black/20 z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
          {items.map((item, i) =>
            item.href ? (
              <a
                key={i}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-left px-4 py-3 text-base hover:bg-muted transition-colors ${item.className ?? ""}`}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={i}
                className={`w-full text-left px-4 py-3 text-base hover:bg-muted transition-colors ${item.className ?? ""}`}
                disabled={item.disabled}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
