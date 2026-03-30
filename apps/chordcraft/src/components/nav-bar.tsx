"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, BarChart3, Headphones } from "lucide-react";

const tabs = [
  { href: "/", label: "Practice", icon: Music },
  { href: "/ear-training", label: "Ear Training", icon: Headphones },
  { href: "/stats", label: "Stats", icon: BarChart3 },
];

export function NavBar() {
  const pathname = usePathname();

  // Hide NavBar on the dashboard page — it's a standalone view
  if (pathname === "/dashboard") return null;

  return (
    <nav className="border-t border-border bg-card/80 backdrop-blur-sm shrink-0">
      <div className="flex justify-center">
        {tabs.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1 px-8 py-3 md:py-4 text-xs md:text-sm font-medium transition-colors min-w-[80px] md:min-w-[120px] ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 md:w-6 md:h-6" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
