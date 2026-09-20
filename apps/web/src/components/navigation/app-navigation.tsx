"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/", label: "홈" },
  { href: "/ems", label: "EMS" },
  { href: "/gms", label: "GMS" },
  { href: "/mms", label: "MMS" },
  { href: "/search", label: "검색" },
] as const;

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="app-navigation">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link className="text-lg font-black tracking-tight text-slate-950" href="/">
          Music Pie
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {navigationItems.map((item) => (
            <NavigationLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </div>
      <div className="app-mobile-navigation md:hidden">
        {navigationItems.map((item) => (
          <NavigationLink key={item.href} item={item} pathname={pathname} mobile />
        ))}
      </div>
    </nav>
  );
}

function NavigationLink({
  item,
  pathname,
  mobile = false,
}: {
  item: (typeof navigationItems)[number];
  pathname: string;
  mobile?: boolean;
}) {
  const isCurrent = pathname === item.href;

  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className={`rounded-full px-3 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
        isCurrent
          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      } ${mobile ? "min-w-11 px-2 text-center text-xs" : ""}`}
      href={item.href}
    >
      {item.label}
    </Link>
  );
}
