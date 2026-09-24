import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, BarElement, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { RefreshCw } from "lucide-react";
import { getEmsStatistics, type EmsStatistics } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

ChartJS.register(BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const number = (value: number) => value.toLocaleString("ko-KR");

const barOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, ticks: { color: "#8b98a5", precision: 0 }, grid: { color: "rgba(139,152,165,0.14)" } },
    y: { ticks: { color: "#c4cdd5" }, grid: { display: false } },
  },
};

const verticalOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: "#8b98a5" }, grid: { display: false } },
    y: { beginAtZero: true, ticks: { color: "#8b98a5", precision: 0 }, grid: { color: "rgba(139,152,165,0.14)" } },
  },
};

const lineOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: "#8b98a5", maxTicksLimit: 8 }, grid: { display: false } },
    y: { beginAtZero: true, ticks: { color: "#8b98a5", precision: 0 }, grid: { color: "rgba(139,152,165,0.14)" } },
  },
};

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="hud-card rounded-2xl p-5">
    <p className="text-sm text-hud-text-secondary">{label}</p>
    <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
    <p className="mt-2 text-xs text-hud-text-muted">{note}</p>
  </article>;
}

function Panel({ title, description, empty, children }: { title: string; description: string; empty: boolean; children: ReactNode }) {
  return <section className="hud-card rounded-2xl p-5 md:p-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-1 text-sm text-hud-text-secondary">{description}</p>
    {empty ? <p className="mt-8 rounded-xl border border-dashed border-hud-border-secondary px-4 py-10 text-center text-sm text-hud-text-muted">원천 메타데이터가 아직 없습니다.</p> : <div className="mt-6 h-72">{children}</div>}
  </section>;
}

export default function Statistics() {
  const [stats, setStats] = useState<EmsStatistics | null>(null);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStats(await getEmsStatistics());
      setError("");
      setRefreshedAt(new Date());
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const active = stats?.activeCount ?? 0;
  const tagged = stats?.taggedCount ?? 0;
  const dated = stats?.releaseDatedCount ?? 0;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Statistics</p>
        <h1 className="mt-2 text-3xl font-semibold">태그·시기 통계</h1>
        <p className="mt-2 text-sm text-hud-text-secondary">활성 트랙 기준. MusicBrainz 태그·발매일과 EMS 유입일을 구분해 봅니다.</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-hud-text-muted">
        <span>{refreshedAt ? `${refreshedAt.toLocaleTimeString("ko-KR")} 갱신` : "불러오는 중…"}</span>
        <button type="button" onClick={() => { void refresh(); }} aria-label="통계 새로고침" className="rounded-xl border border-hud-border-secondary p-3 hover:bg-hud-bg-hover"><RefreshCw size={18} /></button>
      </div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 p-4 text-sm text-hud-accent-danger">{error}</p>}

    <section aria-label="데이터 범위" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="활성 트랙" value={stats ? number(active) : "—"} note="EMS 카탈로그" />
      <Metric label="태그 보유" value={stats ? number(tagged) : "—"} note={stats ? `미분류 ${number(active - tagged)}곡 · ${active ? Math.round(tagged / active * 100) : 0}% 수록` : "MusicBrainz 녹음 태그"} />
      <Metric label="발매일 보유" value={stats ? number(dated) : "—"} note={stats ? `미상 ${number(active - dated)}곡 · ${active ? Math.round(dated / active * 100) : 0}% 수록` : "MusicBrainz / TIDAL"} />
      <Metric label="유입일 보유" value={stats ? number(active) : "—"} note="EMS에 처음 들어온 날짜" />
    </section>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="MusicBrainz 태그 상위 15개" description="한 곡에 여러 태그가 붙을 수 있어 합계는 트랙 수보다 클 수 있습니다." empty={!stats?.tags.length}>
        <Bar options={{ ...barOptions, indexAxis: "y" }} data={{ labels: stats?.tags.map((item) => item.label), datasets: [{ data: stats?.tags.map((item) => item.count) ?? [], backgroundColor: "#50d9cf", borderRadius: 4 }] }} />
      </Panel>
      <Panel title="발매 시기" description="MusicBrainz 최초 발매일 우선, 없으면 TIDAL 앨범 발매일. 10년 단위입니다." empty={!stats?.releaseDecades.length}>
        <Bar options={verticalOptions} data={{ labels: stats?.releaseDecades.map((item) => item.label), datasets: [{ data: stats?.releaseDecades.map((item) => item.count) ?? [], backgroundColor: "#8b7cf6", borderRadius: 4 }] }} />
      </Panel>
    </div>

    <Panel title="EMS 유입 시기" description="한국 시간 기준 최근 유입일 30개. 발매일과 다른 값입니다." empty={!stats?.arrivalsByDay.length}>
      <Line options={lineOptions} data={{ labels: stats?.arrivalsByDay.map((item) => item.label.slice(5)), datasets: [{ data: stats?.arrivalsByDay.map((item) => item.count) ?? [], borderColor: "#50d9cf", backgroundColor: "rgba(80,217,207,0.18)", fill: true, tension: 0.25, pointRadius: 3 }] }} />
    </Panel>
    {stats && <p className="text-xs text-hud-text-muted">발매일 원천 수록: MusicBrainz {number(stats.musicbrainzDateCount)}곡 · TIDAL {number(stats.tidalDateCount)}곡. 원천별 수는 중복될 수 있습니다.</p>}
    <p className="text-xs text-hud-text-muted">MusicBrainz 태그: MetaBrainz 기여자, <a className="underline hover:text-hud-text-primary" href="https://musicbrainz.org/doc/MusicBrainz_Database/Download" rel="noreferrer" target="_blank">CC BY-NC-SA 3.0</a>.</p>
  </div>;
}
