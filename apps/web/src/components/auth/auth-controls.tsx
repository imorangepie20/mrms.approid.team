import Link from "next/link";

type AuthenticatedUser = {
  email?: string | null;
  name?: string | null;
};

type AuthControlsProps = {
  user: AuthenticatedUser | null;
  isAdmin?: boolean;
};

export function AuthControls({ user, isAdmin = false }: AuthControlsProps) {
  if (user) {
    return (
      <div className="auth-controls">
        {isAdmin && <Link href="/admin">관리자</Link>}
        <Link className="auth-account-link" href="/account">{user.name ?? user.email ?? "계정"}</Link>
        <a href="/api/auth/logout">로그아웃</a>
      </div>
    );
  }

  return (
    <div className="auth-controls">
      <a href="/api/auth/login">로그인</a>
      <a href="/api/auth/login?screen_hint=signup">회원가입</a>
    </div>
  );
}
