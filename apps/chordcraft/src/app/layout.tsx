import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { basepathShimSource } from "@music-apps/shared";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChordCraft",
  description: "Practice chord progressions in any key",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChordCraft",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch{}`,
          }}
        />
        {/* Rewrite root-absolute /api/* and /uploads/* URLs to include the Next
            basePath, so the app works behind the music-apps proxy at /chordcraft. */}
        <script dangerouslySetInnerHTML={{ __html: basepathShimSource("/chordcraft") }} />
      </head>
      <body className="h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-geist-sans)] overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
        <NavBar />
      </body>
    </html>
  );
}
