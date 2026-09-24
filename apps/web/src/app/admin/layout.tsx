import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { isAdminAuth0Subject } from "@/lib/auth/admin";
import { auth0 } from "@/lib/auth/auth0";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession();
  if (!session?.user.sub) {
    const pathname = (await headers()).get("x-music-pie-pathname") ?? "/admin";
    const returnTo = pathname === "/admin" || pathname.startsWith("/admin/") ? pathname : "/admin";
    redirect(`/api/auth/login?${new URLSearchParams({ returnTo })}`);
  }
  if (!isAdminAuth0Subject(session.user.sub)) notFound();

  return children;
}
