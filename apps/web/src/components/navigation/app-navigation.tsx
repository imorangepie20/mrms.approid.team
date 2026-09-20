"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthControls } from "@/components/auth/auth-controls";

type NavigationUser = {
  email?: string | null;
  name?: string | null;
};

const items = [
  { href: "/", label: "홈", sub: "MAIN" },
  { href: "/mms", label: "My Music Space", sub: "MMS" },
  { href: "/gms", label: "Gateway Music Space", sub: "GMS" },
  { href: "/ems", label: "External Music Space", sub: "EMS" },
];

export function AppNavigation({ user = null }: { user?: NavigationUser | null }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href;

  return (
    <>
      <nav aria-label="주요 메뉴" className="app-navigation">
        <Link className="app-logo" href="/">π <span>music-</span>pie</Link>
        <Link className="app-search" href="/search">⌕ 검색</Link>
        <p className="app-nav-label">내 공간</p>
        {items.map((item) => (
          <Link key={item.href} aria-current={isCurrent(item.href) ? "page" : undefined} className="app-nav-item" href={item.href}>
            <b>{item.label}</b><small>{item.sub}</small>
          </Link>
        ))}
      </nav>
      <nav aria-label="모바일 주요 메뉴" className="mobile-quick-nav">
        {items.map((item) => (
          <Link key={item.href} aria-current={isCurrent(item.href) ? "page" : undefined} href={item.href}>{item.sub}</Link>
        ))}
      </nav>
      <AuthControls user={user} />
    </>
  );
}
