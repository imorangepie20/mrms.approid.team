import { useEffect, useState } from "react";
import { Activity, ImageOff, Layers3, Music2 } from "lucide-react";
import { getEmsSummary, type EmsSummary } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const cards = [
  { key: "activeTrackCount", label: "활성 트랙", icon: Music2, accent: "text-hud-accent-primary" },
  { key: "activeSectionCount", label: "활성 카테고리", icon: Layers3, accent: "text-hud-accent-secondary" },
  { key: "artworkMissingCount", label: "artwork 누락", icon: ImageOff, accent: "text-hud-accent-warning" },
] as const;

function statusClass(status: string) {
  if (["completed", "active"].includes(status)) return "text-hud-accent-success";
  if (["failed", "rolled_back"].includes(status)) return "text-hud-accent-danger";
  return "text-hud-accent-warning";
}

export default function Dashboard() {
  const [summary, setSummary] = useState<EmsSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getEmsSummary().then((value) => { if (active) setSummary(value); }).catch((reason: unknown) => { if (active) setError(apiErrorMessage(reason)); });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">Editorial Music Space</p>
        <h1 className="mt-2 text-3xl font-semibold">EMS 운영 현황</h1>
        <p className="mt-2 text-sm text-hud-text-secondary">메인과 EMS에 노출되는 카탈로그 상태를 확인합니다.</p>
      </section>
      {error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ key, label, icon: Icon, accent }) => (
          <article className="hud-card rounded-2xl p-5" key={key}>
            <div className="flex items-center justify-between"><span className="text-sm text-hud-text-secondary">{label}</span><Icon className={accent} size={20} /></div>
            <p className="mt-5 text-4xl font-semibold">{summary ? summary[key] : "—"}</p>
          </article>
        ))}
      </div>
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="hud-card rounded-2xl p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">임베딩 상태</h2><Activity className="text-hud-accent-primary" size={18} /></div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {Object.entries(summary?.embeddingCounts ?? {}).map(([status, count]) => <div className="rounded-xl bg-hud-bg-hover p-3" key={status}><p className="text-xs uppercase text-hud-text-muted">{status}</p><p className="mt-2 text-2xl font-semibold">{count}</p></div>)}
            {!summary && <p className="text-sm text-hud-text-muted">불러오는 중…</p>}
          </div>
        </article>
        <article className="hud-card rounded-2xl p-5"><h2 className="font-semibold">최근 수집</h2>{summary?.latestIngest ? <div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span className="text-hud-text-secondary">상태</span><span className={statusClass(summary.latestIngest.status)}>{summary.latestIngest.status}</span></div><div className="flex justify-between"><span className="text-hud-text-secondary">매칭</span><span>{summary.latestIngest.matchedCount} / {summary.latestIngest.requestedCount}</span></div><div className="flex justify-between"><span className="text-hud-text-secondary">실행 시각</span><span>{new Date(summary.latestIngest.createdAt).toLocaleString("ko-KR")}</span></div></div> : <p className="mt-5 text-sm text-hud-text-muted">기록이 없습니다.</p>}</article>
      </section>
    </div>
  );
}
