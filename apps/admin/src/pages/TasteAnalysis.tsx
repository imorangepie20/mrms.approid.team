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
  { title: "분위기·제작", summary: "happy·sad·relaxed·aggressive·party, danceability, acoustic·electronic 확률" },
];

const modelReferences = [
  { name: "Essentia DSP", role: "30초와 10초 3구간의 리듬·에너지·음색·화성 측정", status: "1차 채택" },
  { name: "MAEST 30s", role: "프리뷰 전체의 모델 native audio embedding과 장르 성향", status: "1차 채택" },
  { name: "MusiCNN heads", role: "mood·danceability·voice/instrumental 확률", status: "선택 적용" },
  { name: "LAION-CLAP", role: "자연어와 오디오를 연결하는 별도 임베딩 공간", status: "후속 shadow" },
];

const pipeline = [
  ["01", "프리뷰 검증", "30초 입력의 byte·duration·codec을 제한하고 SHA-256 identity 생성"],
  ["02", "Essentia DSP", "10초 3구간과 전체 30초의 low-level feature와 변화량 계산"],
  ["03", "오디오 모델", "MAEST 30초 embedding과 선택한 MusiCNN high-level prediction 생성"],
  ["04", "사용자 집계", "플레이리스트·좋아요·수락 가중치로 별도 audio centroid와 군집 계산"],
  ["05", "추천 결합", "Source부터 Selector까지 단계화하고 실제 component와 version 기록"],
] as const;

const phases = [
  "프리뷰 identity·다운로드·decode와 bounded job",
  "Essentia DSP 저장과 관리자 coverage 관측",
  "MAEST embedding·MusiCNN prediction 저장",
  "트랙별 상태·지표·실패 원인 관리자 조회",
  "사용자 오디오 중심 계산과 shadow 평가",
  "여섯 단계 hybrid ranking 제한 활성화",
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
          <MetricCard icon={BrainCircuit} label="텍스트 표현" value="768 dimensions" note="현재 메타데이터 임베딩의 고정 차원입니다." />
          <MetricCard icon={AudioWaveform} label="오디오 단위" value="10s × 3" note="30초 프리뷰를 세 구간으로 나눠 평균과 변화를 함께 봅니다." />
          <MetricCard icon={Database} label="오디오 표현" value="model-native" note="MAEST 원래 차원을 저장하며 텍스트 768차원에 맞추지 않습니다." />
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
        <p className="text-sm leading-7 text-hud-text-secondary">DSP는 세 구간과 전체 30초를 함께 저장합니다. 분위기·악기·제작 지표는 채택 모델이 실제 제공하는 label만 확률과 revision으로 기록하며 이름만 보고 추정하지 않습니다.</p>
      </section>

      <section aria-labelledby="models-title" className="space-y-4">
        <div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">REFERENCE STACK</p><h2 className="mt-1 text-xl font-semibold" id="models-title">참고 프로젝트와 채택 모델</h2></div>
        <div className="grid gap-4 md:grid-cols-2">
          {modelReferences.map((item) => <article className="hud-card rounded-2xl p-5" key={item.name}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-hud-text-primary">{item.name}</h3><span className="rounded-full border border-hud-border-secondary px-2.5 py-1 text-xs text-hud-text-muted">{item.status}</span></div><p className="mt-3 text-sm leading-6 text-hud-text-secondary">{item.role}</p></article>)}
        </div>
        <p className="text-sm leading-7 text-hud-text-secondary">low-level DSP와 high-level prediction은 AcousticBrainz 방식처럼 별도 version으로 저장합니다. 구현 순서는 docs/plans/2026-09-29-audio-preview-analysis-implementation.md를 따릅니다.</p>
      </section>

      <section aria-labelledby="score-title" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="hud-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-start gap-3"><Gauge className="mt-1 shrink-0 text-hud-accent-primary" size={22} /><div><p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">SCORING</p><h2 className="mt-1 text-xl font-semibold" id="score-title">결합 추천 점수</h2></div></div>
          <pre className="mt-5 overflow-x-auto rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4 text-xs leading-6 text-hud-text-secondary sm:text-sm"><code>{`hybrid_similarity =
  text   × 0.45
  audio  × 0.40
  mood   × 0.10
  rhythm × 0.05

base_score =
  hybrid_similarity  × 0.65
  catalog_confidence × 0.15
  freshness          × 0.10
  editorial_priority × 0.10

final_score = diversity_selector(base_score)`}</code></pre>
          <p className="mt-4 text-sm leading-6 text-hud-text-secondary">텍스트와 오디오는 별도 공간에서 유사도를 계산합니다. 후보 점수는 독립적으로 계산하고 다양성은 Selector 재정렬에서 적용합니다.</p>
        </article>
        <article className="hud-card rounded-2xl p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-hud-text-muted">RESOURCE / TRACK</p><h2 className="mt-1 text-xl font-semibold">30초 처리 예상량</h2>
          <dl className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 text-sm">
            <dt className="text-hud-text-secondary">320kbps 입력</dt><dd className="font-mono">약 1.2MB</dd>
            <dt className="text-hud-text-secondary">mono 16kHz PCM</dt><dd className="font-mono">약 1.83MiB</dd>
            <dt className="text-hud-text-secondary">임베딩 저장량</dt><dd className="font-mono">dims × 4B</dd>
            <dt className="text-hud-text-secondary">CPU·GPU 추론</dt><dd className="font-mono">실측 예정</dd>
            <dt className="text-hud-text-secondary">필수 benchmark</dt><dd className="font-mono">p50/p95 · RSS</dd>
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
