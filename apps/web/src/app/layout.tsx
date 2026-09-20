import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MusicSessionProvider } from "@/providers/music-session-provider";
import { PersistentPlayer } from "@/components/player/persistent-player";
import { AppNavigation } from "@/components/navigation/app-navigation";

import "./globals.css";

export const metadata: Metadata = {
  title: "Music Pie",
  description: "플레이리스트로 발견하는 나만의 음악 취향",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
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
