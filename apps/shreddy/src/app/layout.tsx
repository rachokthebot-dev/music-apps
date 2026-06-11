import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { basepathShimSource } from "@music-apps/shared";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shreddy",
  description: "Guitar practice companion",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Shreddy",
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
            basePath, so the app works behind the music-apps proxy at /shreddy. */}
        <script dangerouslySetInnerHTML={{ __html: basepathShimSource("/shreddy") }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-geist-sans)]">
        {children}
      </body>
    </html>
  );
}
