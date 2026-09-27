"use client";

import { useRouter } from "next/navigation";

import { TidalDeviceAuthorization } from "@/components/player/tidal-device-authorization";

export function TidalConnectionAuthorization({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  return (
    <TidalDeviceAuthorization
      className="onboarding-primary-action inline-flex min-h-11 items-center rounded-xl bg-[var(--brand)] px-5 font-bold text-[#111118]"
      intent="connection"
      onConnected={() => router.replace(returnTo)}
    />
  );
}
