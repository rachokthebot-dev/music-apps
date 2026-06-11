import type { Metadata, Viewport } from "next";
import { basepathShimSource } from "@music-apps/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: "soundpath",
  description: "Analyze and tune your Helix LT preset holistically",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Rewrite root-absolute /api/* and /uploads/* URLs to include the Next
            basePath, so the app works behind the music-apps proxy at /soundpath. */}
        <script dangerouslySetInnerHTML={{ __html: basepathShimSource("/soundpath") }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
