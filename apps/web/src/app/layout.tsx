import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MusicSessionProvider } from "@/providers/music-session-provider";
import { PersistentPlayer } from "@/components/player/persistent-player";
import { AppNavigation } from "@/components/navigation/app-navigation";
import { auth0 } from "@/lib/auth/auth0";
import { getUserLikes } from "@/lib/db/user-likes";
import { LikesProvider } from "@/providers/likes-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Music Pie",
  description: "플레이리스트로 발견하는 나만의 음악 취향",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession();
  const likes = session?.user.sub && process.env.DATABASE_URL
    ? await getUserLikes(session.user.sub)
    : [];
  const user = session
    ? { email: session.user.email, name: session.user.name }
    : null;

  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LikesProvider initialLikes={likes} isAuthenticated={Boolean(session)}>
          <MusicSessionProvider>
            <AppNavigation user={user} />
            <main className="page-shell flex-1">{children}</main>
            <PersistentPlayer />
          </MusicSessionProvider>
        </LikesProvider>
      </body>
    </html>
  );
}
