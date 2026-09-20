import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { MusicSessionProvider } from "@/providers/music-session-provider";
import { PersistentPlayer } from "@/components/player/persistent-player";
import { AppNavigation } from "@/components/navigation/app-navigation";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Music Pie",
  description: "플레이리스트로 발견하는 나만의 음악 취향",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <MusicSessionProvider>
          <AppNavigation />
          <main className="page-shell flex-1">{children}</main>
          <PersistentPlayer />
        </MusicSessionProvider>
      </body>
    </html>
  );
}
