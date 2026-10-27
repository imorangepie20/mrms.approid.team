import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../globals.css";

export const metadata: Metadata = {
  title: "Music Pie",
};

// 일반 화면과 다른 root layout이라 두 영역 사이 이동은 항상 전체 문서를 새로 불러온다.
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
