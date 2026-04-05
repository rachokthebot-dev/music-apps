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
        className="p-1 rounded-full hover:bg-muted-foreground/15 text-muted-foreground transition-colors"
        onClick={onToggle}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-8 w-40 bg-card border border-border rounded-lg shadow-lg shadow-black/20 z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
          {items.map((item, i) =>
            item.href ? (
              <a
                key={i}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${item.className ?? ""}`}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={i}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${item.className ?? ""}`}
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
