import { useEffect, useState } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import { getScreenSections, updateScreenSection, type EmsSection, type Screen } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";
import HomeContentEditor from "./HomeContentEditor";

type Draft = Pick<EmsSection, "title" | "description" | "sortOrder" | "active">;

function asDraft(section: EmsSection): Draft {
  return { title: section.title, description: section.description, sortOrder: section.sortOrder, active: section.active };
}

export default function Sections({ screen }: { screen: Screen }) {
  const [sections, setSections] = useState<EmsSection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setSections([]);
    setDrafts({});
    setNotice("");
    setError("");
    void getScreenSections(screen).then((items) => {
      if (!current) return;
      setSections(items);
      setDrafts(Object.fromEntries(items.map((item) => [item.id, asDraft(item)])));
    }).catch((reason: unknown) => {
      if (current) setError(apiErrorMessage(reason));
    });
    return () => { current = false; };
  }, [screen]);

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  async function save(section: EmsSection) {
    const draft = drafts[section.id];
    if (!draft) return;
    setSaving(section.id);
    setNotice("");
    setError("");
    try {
      const saved = await updateScreenSection(screen, section.id, draft);
      setSections((current) => current.map((item) => item.id === saved.id ? saved : item)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug)));
      setDrafts((current) => ({ ...current, [saved.id]: asDraft(saved) }));
      setNotice(`${saved.title} 저장 완료`);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(null);
    }
  }

  const isHome = screen === "home";
  const title = isHome ? "메인 화면 관리" : "EMS 화면 관리";
  const visibleLimit = isHome ? 3 : 5;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">SCREEN / {screen.toUpperCase()}</p>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-hud-text-secondary">이 화면의 제목·설명·순서·노출을 편집합니다. 다른 화면에는 반영되지 않습니다.</p>
        <p className="mt-1 text-xs text-hud-text-muted">활성 섹션 중 순서가 빠른 {visibleLimit}개가 표시됩니다. 곡 목록은 EMS 카탈로그를 공유합니다.</p>
      </div>
      <a href={isHome ? "/" : "/ems"} target="_blank" rel="noreferrer" className="rounded-lg border border-hud-border-secondary px-4 py-2 text-sm text-hud-text-secondary hover:bg-hud-bg-hover">실제 화면 보기</a>
    </header>

    {(error || notice) && <div role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-hud-accent-danger/40 bg-hud-accent-danger/10 text-hud-accent-danger" : "border-hud-accent-success/40 bg-hud-accent-success/10 text-hud-accent-success"}`}>{error || notice}</div>}

    {isHome && <HomeContentEditor />}

    <div className="space-y-4">
      {isHome && <h2 className="text-2xl font-semibold">EMS 선곡 관리</h2>}
      {sections.map((section) => {
        const draft = drafts[section.id];
        return <article className="hud-card rounded-2xl p-5" key={section.id}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-hud-text-muted">{section.slug}</p>
              <p className="mt-1 text-sm text-hud-text-secondary">{section.trackCount}곡 · {new Date(section.updatedAt).toLocaleDateString("ko-KR")} 수정</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-hud-text-secondary">
              <input checked={draft?.active ?? section.active} onChange={(event) => setDraft(section.id, { active: event.target.checked })} type="checkbox" /> 이 화면에 노출
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr_100px_auto]">
            <label className="text-sm text-hud-text-secondary">제목
              <input className="mt-2 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2 text-hud-text-primary" value={draft?.title ?? section.title} onChange={(event) => setDraft(section.id, { title: event.target.value })} />
            </label>
            <label className="text-sm text-hud-text-secondary">설명
              <input className="mt-2 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2 text-hud-text-primary" value={draft?.description ?? section.description} onChange={(event) => setDraft(section.id, { description: event.target.value })} />
            </label>
            <label className="text-sm text-hud-text-secondary">순서
              <input className="mt-2 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2 text-hud-text-primary" min="0" type="number" value={draft?.sortOrder ?? section.sortOrder} onChange={(event) => setDraft(section.id, { sortOrder: Number(event.target.value) })} />
            </label>
            <div className="mt-auto flex gap-2">
              <button aria-label={`${section.title} 변경 취소`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-hud-border-secondary px-3 text-sm text-hud-text-secondary hover:text-hud-text-primary disabled:opacity-50" disabled={saving === section.id} onClick={() => setDrafts((current) => ({ ...current, [section.id]: asDraft(section) }))} type="button"><RotateCcw size={16} /> 취소</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-hud-accent-primary px-4 text-sm font-semibold text-hud-bg-primary disabled:opacity-50" disabled={saving === section.id} onClick={() => void save(section)} type="button">{saving === section.id ? <Check size={16} /> : <Save size={16} />} 저장</button>
            </div>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
