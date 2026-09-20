import Link from "next/link";
import { redirect } from "next/navigation";

import { auth0 } from "@/lib/auth/auth0";

type AccountUser = {
  email?: string | null;
  name?: string | null;
};

type TidalStatus = "not_connected" | "connected";

export function AccountPageContent({
  tidalStatus,
  user,
}: {
  tidalStatus: TidalStatus;
  user: AccountUser;
}) {
  const isConnected = tidalStatus === "connected";

  return (
    <section className="account-page dashboard-page">
      <h1 className="space-title">계정</h1>
      <div className="account-panel">
        <div>
          <p>로그인 계정</p>
          <h2>{user.name ?? "Music Pie 사용자"}</h2>
          <span>{user.email ?? "이메일 정보 없음"}</span>
        </div>
        <div className="account-status" data-status={tidalStatus}>
          <p>TIDAL</p>
          <strong>{isConnected ? "TIDAL 연결됨" : "TIDAL 연결 필요"}</strong>
          {isConnected ? (
            <span>개인화 음악 기능을 사용할 수 있습니다.</span>
          ) : (
            <Link href="/onboarding">TIDAL 연결 계속하기</Link>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function AccountPage() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/api/auth/login?returnTo=/account");
  }

  return (
    <AccountPageContent
      tidalStatus="not_connected"
      user={{ email: session.user.email, name: session.user.name }}
    />
  );
}
