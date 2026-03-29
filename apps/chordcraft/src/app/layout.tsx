import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
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
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-geist-sans)]">
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
        <NavBar />
      </body>
    </html>
  );
}
