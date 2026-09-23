import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Sections from "./pages/Sections";
import Tracks from "./pages/Tracks";
import Ingestion from "./pages/Ingestion";

const pages = [
  { href: "/", label: "Dashboard" },
  { href: "/sections", label: "Sections" },
  { href: "/tracks", label: "Tracks" },
  { href: "/ingestion", label: "Ingestion" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-hud-bg-primary hud-grid-bg text-hud-text-primary">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 border-r border-hud-border-secondary bg-hud-bg-secondary/95 p-5 md:block">
        <div className="flex items-center gap-3 border-b border-hud-border-secondary pb-5">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-hud-accent-primary to-hud-accent-secondary font-bold text-hud-bg-primary">M</div>
          <div>
            <p className="font-semibold">Music Pie</p>
            <p className="text-xs text-hud-text-muted">EMS control</p>
          </div>
        </div>
        <nav className="mt-6 space-y-1" aria-label="관리자 메뉴">
          {pages.map((page) => (
            <NavLink
              key={page.href}
              to={page.href}
              end={page.href === "/"}
              className={({ isActive }) => `block rounded-lg px-3 py-2.5 text-sm transition ${isActive ? "bg-hud-accent-primary/15 text-hud-accent-primary" : "text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary"}`}
            >
              {page.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-h-screen p-5 md:ml-64 md:p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-hud-accent-primary">MRMS / ADMIN</p>
            <p className="mt-1 text-sm text-hud-text-secondary">EMS catalog operations</p>
          </div>
          <a className="text-sm text-hud-text-secondary hover:text-hud-accent-primary" href="/">사용자 화면</a>
        </header>
        <nav className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-hud-border-secondary bg-hud-bg-secondary/80 p-2 md:hidden" aria-label="모바일 관리자 메뉴">
          {pages.map((page) => <NavLink key={page.href} to={page.href} end={page.href === "/"} className={({ isActive }) => `rounded-lg px-3 py-2 text-center text-sm ${isActive ? "bg-hud-accent-primary/15 text-hud-accent-primary" : "text-hud-text-secondary"}`}>{page.label}</NavLink>)}
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sections" element={<Sections />} />
          <Route path="/tracks" element={<Tracks />} />
          <Route path="/ingestion" element={<Ingestion />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
