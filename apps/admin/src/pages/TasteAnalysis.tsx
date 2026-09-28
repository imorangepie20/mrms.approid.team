import {
  Activity,
  AudioWaveform,
  BrainCircuit,
  Database,
  Gauge,
  GitMerge,
  ListMusic,
} from "lucide-react";

const currentSignals = [
  { signal: "TIDAL 플레이리스트", effect: "취향 기준선", weight: "기본 1.0" },
  { signal: "여러 선택 플레이리스트에 포함", effect: "반복 소속 강화", weight: "최대 1.75" },
  { signal: "동일 아티스트 반복", effect: "아티스트 편향 완화", weight: "1 / √곡 수" },
  { signal: "트랙 좋아요", effect: "긍정 선호 강화", weight: "2.0" },
  { signal: "GMS 추천 수락", effect: "긍정 선호 강화", weight: "2.0" },
  { signal: "GMS 싫어요", effect: "이후 후보에서 영구 제외", weight: "제외 필터" },
];

const audioMetricGroups = [
  { title: "리듬", summary: "BPM, 비트 강도, 규칙성, onset 밀도, syncopation, groove, 타악 비율" },
  { title: "에너지", summary: "loudness, RMS, peak, dynamic range, crest factor, 구간별 변화" },
  { title: "음색", summary: "spectral centroid·bandwidth·rolloff·flatness, MFCC, 저·중·고역 비율" },
  { title: "화성", summary: "key, mode, chroma, 조성 안정성, 화음 변화, 복잡도, 긴장감" },
  { title: "보컬·악기", summary: "보컬 점유율, 연주곡 확률, speechiness, 악기별 존재 확률" },
  { title: "분위기·제작", summary: "valence, arousal, tension, danceability, acoustic·electronic, mix 질감" },
];

const pipeline = [
  ["01", "프리뷰 준비", "30초 입력을 모델 native sample rate로 변환하고 10초씩 세 구간으로 분리"],
  ["02", "구간 분석", "DSP 지표와 구간별 오디오 임베딩을 독립적으로 계산"],
  ["03", "트랙 통합", "세 구간 평균·분산과 대표 오디오 임베딩을 생성"],
  ["04", "사용자 집계", "플레이리스트·좋아요·수락 가중치로 전역 중심과 최대 3개 군집 계산"],
  ["05", "추천 결합", "텍스트·오디오·분위기·리듬 유사도를 결합하고 GMS 근거로 기록"],
] as const;

const phases = [
  "프리뷰 수집·디코딩·hash 계약과 bounded worker",
  "세 구간 DSP 지표·오디오 임베딩 저장",
  "트랙별 상태·지표·실패 원인 관리자 조회",
  "사용자 오디오 중심 계산과 shadow 평가",
  "텍스트·오디오 순위 비교와 결합 점수 고정",
  "GMS 제한 반영과 싫어요 입력 충돌 해소",
];

function StatusBadge({ children, proposed = false }: { children: string; proposed?: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${proposed
      ? "border-hud-accent-warning/40 bg-hud-accent-warning/10 text-hud-accent-warning"
      : "border-hud-accent-success/40 bg-hud-accent-success/10 text-hud-accent-success"
    }`}>
      {children}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, note }: {
  icon: typeof Activity;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="hud-card min-w-0 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">{label}</p>
        <Icon className="shrink-0 text-hud-accent-primary" size={20} />
      </div>
      <p className="mt-4 break-words font-mono text-2xl font-semibold text-hud-text-primary">{value}</p>
      <p className="mt-2 text-sm leading-6 text-hud-text-secondary">{note}</p>
    </article>
  );
}

export default function TasteAnalysis() {
  return (
    <div className="min-w-0 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-4xl">
          <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">RECOMMENDATION / TASTE SYSTEM</p>
          <h1 className="mt-2 text-3xl font-semibold">통합 취향 분석 설계</h1>
          <p className="mt-3 text-sm leading-7 text-hud-text-secondary">
            현재 TIDAL 메타데이터 취향 분석과 30초 프리뷰 오디오 분석의 입력, 가중치, 지표, 결합 점수와 구현 순서를 한 화면에서 확인합니다.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-hud-text-muted">docs/overview/taste-analysis-system.md · 2026-09-29</p>
        </div>
        <div className="flex flex-wrap gap-2"><StatusBadge>현재 구현</StatusBadge><StatusBadge proposed>오디오 확장 제안</StatusBadge></div>
      </header>

      <section aria-labelledby="summary-title" className="space-y-4">
        <div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">SYSTEM SUMMARY</p><h2 className="mt-1 text-xl font-semibold" id="summary-title">분석 기준</h2></div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ListMusic} label="최소 입력" value="15 tracks" note="고유 트랙 15곡 미만이면 취향 프로필을 만들지 않습니다." />
          <MetricCard icon={BrainCircuit} label="현재 표현" value="768 dimensions" note="텍스트 메타데이터를 L2 정규화 벡터로 변환합니다." />
          <MetricCard icon={AudioWaveform} label="오디오 단위" value="10s × 3" note="30초 프리뷰를 세 구간으로 나눠 평균과 변화를 함께 봅니다." />
          <MetricCard icon={Database} label="프로필 구조" value="1 + up to 3" note="전역 취향 중심 하나와 최대 세 개의 취향 군집을 유지합니다." />
        </div>
      </section>

      <section aria-labelledby="flow-title" className="hud-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3"><GitMerge className="mt-1 shrink-0 text-hud-accent-primary" size={22} /><div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">DATA FLOW</p><h2 className="mt-1 text-xl font-semibold" id="flow-title">텍스트와 오디오의 결합 흐름</h2></div></div>
        <ol className="mt-6 grid gap-3 lg:grid-cols-5">
          {pipeline.map(([number, title, description]) => (
            <li className="min-w-0 rounded-xl border border-hud-border-secondary bg-hud-bg-primary/50 p-4" key={number}>
              <p className="font-mono text-xs text-hud-accent-primary">{number}</p>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-hud-text-secondary">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="current-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">CURRENT MODEL</p><h2 className="mt-1 text-xl font-semibold" id="current-title">현재 사용자 신호와 가중치</h2></div><StatusBadge>운영 코드 기준</StatusBadge></div>
        <div className="hud-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-hud-border-secondary text-xs uppercase tracking-wider text-hud-text-muted"><tr><th className="px-5 py-4">신호</th><th className="px-5 py-4">효과</th><th className="px-5 py-4">가중치·규칙</th></tr></thead>
              <tbody>{currentSignals.map((item) => <tr className="border-b border-hud-border-secondary/70 last:border-0" key={item.signal}><td className="px-5 py-4 font-medium">{item.signal}</td><td className="px-5 py-4 text-hud-text-secondary">{item.effect}</td><td className="px-5 py-4 font-mono text-hud-accent-primary">{item.weight}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-hud-accent-warning/40 bg-hud-accent-warning/10 px-4 py-3 text-sm leading-6 text-hud-accent-warning">
          싫어요는 현재 음수 벡터 학습보다 후보 제외가 중심입니다. 가져온 플레이리스트의 기본 입력과 충돌하는 경계는 오디오 결합 전에 일치시켜야 합니다.
        </div>
      </section>

      <section aria-labelledby="audio-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">30-SECOND AUDIO</p><h2 className="mt-1 text-xl font-semibold" id="audio-title">프리뷰에서 얻는 분석 지표</h2></div><StatusBadge proposed>구현 예정</StatusBadge></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {audioMetricGroups.map((group) => <article className="hud-card rounded-2xl p-5" key={group.title}><h3 className="font-semibold text-hud-text-primary">{group.title}</h3><p className="mt-3 text-sm leading-6 text-hud-text-secondary">{group.summary}</p></article>)}
        </div>
        <p className="text-sm leading-7 text-hud-text-secondary">각 지표는 세 구간의 평균·표준편차·범위·변화 방향으로 집계합니다. 분위기·악기·제작 지표는 확정값이 아니라 모델 확률과 신뢰도로 저장합니다.</p>
      </section>

      <section aria-labelledby="score-title" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="hud-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-start gap-3"><Gauge className="mt-1 shrink-0 text-hud-accent-primary" size={22} /><div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">SCORING</p><h2 className="mt-1 text-xl font-semibold" id="score-title">결합 추천 점수</h2></div></div>
          <pre className="mt-5 overflow-x-auto rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4 text-xs leading-6 text-hud-text-secondary sm:text-sm"><code>{`hybrid_similarity =
  text   × 0.45
  audio  × 0.40
  mood   × 0.10
  rhythm × 0.05

recommendation_score =
  hybrid_similarity  × 0.65
  catalog_confidence × 0.15
  freshness          × 0.10
  diversity          × 0.10`}</code></pre>
          <p className="mt-4 text-sm leading-6 text-hud-text-secondary">텍스트와 오디오 임베딩은 별도 공간에서 유사도를 계산합니다. 오디오가 없으면 사용 가능한 신호만 합계 1로 재정규화합니다.</p>
        </article>
        <article className="hud-card rounded-2xl p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">RESOURCE / TRACK</p><h2 className="mt-1 text-xl font-semibold">30초 처리 예상량</h2>
          <dl className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 text-sm">
            <dt className="text-hud-text-secondary">320kbps 입력</dt><dd className="font-mono">약 1.2MB</dd>
            <dt className="text-hud-text-secondary">mono 16kHz PCM</dt><dd className="font-mono">약 1.83MiB</dd>
            <dt className="text-hud-text-secondary">GPU 추론</dt><dd className="font-mono">약 0.6~3초</dd>
            <dt className="text-hud-text-secondary">CPU 추론</dt><dd className="font-mono">약 9~43초</dd>
            <dt className="text-hud-text-secondary">대표 768차원 벡터</dt><dd className="font-mono">약 3KB</dd>
          </dl>
        </article>
      </section>

      <section aria-labelledby="rollout-title" className="hud-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3"><Activity className="mt-1 shrink-0 text-hud-accent-primary" size={22} /><div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">ROLLOUT</p><h2 className="mt-1 text-xl font-semibold" id="rollout-title">단계별 구현 순서</h2></div></div>
        <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{phases.map((phase, index) => <li className="flex gap-3 rounded-xl border border-hud-border-secondary p-4 text-sm leading-6" key={phase}><span className="font-mono text-hud-accent-primary">{String(index + 1).padStart(2, "0")}</span><span className="text-hud-text-secondary">{phase}</span></li>)}</ol>
      </section>
    </div>
  );
}
