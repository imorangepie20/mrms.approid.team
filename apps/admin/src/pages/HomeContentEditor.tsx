import { useEffect, useState } from "react";
import { createHomeStory, deleteHomeStory, getHomeContent, updateHomeContent, type HomeContent, type HomeContentDraft } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const blank: HomeContentDraft = { title: "", body: "", linkLabel: "", linkHref: "", sortOrder: 10, active: true };
const labels = { hero: "메인 소개", concept: "사이트 개념", guide: "이용법", story: "음악 이야기" };
const linkHelp = "내부 주소만 입력: /ems, /gms, /mms, /onboarding";

function toDraft(item: HomeContent): HomeContentDraft {
  return { title: item.title, body: item.body, linkLabel: item.linkLabel, linkHref: item.linkHref, sortOrder: item.sortOrder, active: item.active };
}

export default function HomeContentEditor() {
  const [items, setItems] = useState<HomeContent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, HomeContentDraft>>({});
  const [fresh, setFresh] = useState<HomeContentDraft>(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void getHomeContent().then((result) => {
      if (!current) return;
      setItems(result);
      setDrafts(Object.fromEntries(result.map((item) => [item.id, toDraft(item)])));
    }).catch((reason: unknown) => { if (current) setError(apiErrorMessage(reason)); });
    return () => { current = false; };
  }, []);

  function patch(id: string, value: Partial<HomeContentDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...value } }));
  }

  async function save(item: HomeContent) {
    setBusy(item.id); setError(""); setNotice("");
    try {
      const saved = await updateHomeContent(item.id, drafts[item.id]);
      setItems((current) => current.map((part) => part.id === saved.id ? saved : part));
      setDrafts((current) => ({ ...current, [saved.id]: toDraft(saved) }));
      setNotice(`${saved.title} 저장 완료`);
    } catch (reason) { setError(apiErrorMessage(reason)); }
    finally { setBusy(null); }
  }

  async function addStory() {
    setBusy("new"); setError(""); setNotice("");
    try {
      const created = await createHomeStory(fresh);
      setItems((current) => [...current, created]);
      setDrafts((current) => ({ ...current, [created.id]: toDraft(created) }));
      setFresh(blank); setNotice("음악 이야기 추가 완료");
    } catch (reason) { setError(apiErrorMessage(reason)); }
    finally { setBusy(null); }
  }

  async function removeStory(item: HomeContent) {
    if (!window.confirm(`'${item.title}' 이야기를 삭제할까요?`)) return;
    setBusy(item.id); setError(""); setNotice("");
    try {
      await deleteHomeStory(item.id);
      setItems((current) => current.filter((part) => part.id !== item.id));
      setNotice("음악 이야기 삭제 완료");
    } catch (reason) { setError(apiErrorMessage(reason)); }
    finally { setBusy(null); }
  }

  return <section className="space-y-5" aria-labelledby="home-content-heading">
    <div><h2 id="home-content-heading" className="text-2xl font-semibold">메인 콘텐츠</h2><p className="mt-2 text-sm text-hud-text-secondary">사이트 소개·이용법·음악 이야기를 편집합니다. 노출을 끄면 공개 화면에서 숨깁니다.</p></div>
    {(error || notice) && <p role={error ? "alert" : "status"} className="rounded-lg border border-hud-border-secondary p-3 text-sm">{error || notice}</p>}
    {items.map((item) => {
      const draft = drafts[item.id] ?? toDraft(item);
      return <article className="hud-card rounded-2xl p-5" key={item.id}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><span className="text-xs text-hud-accent-primary">{labels[item.kind]}</span><h3 className="mt-1 font-semibold">{item.title}</h3></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(event) => patch(item.id, { active: event.target.checked })} />노출</label></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm">제목<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" maxLength={160} value={draft.title} onChange={(event) => patch(item.id, { title: event.target.value })} /></label>
          <label className="text-sm">순서<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" min={0} max={9999} type="number" value={draft.sortOrder} onChange={(event) => patch(item.id, { sortOrder: Number(event.target.value) })} /></label>
          <label className="text-sm lg:col-span-2">본문<textarea className="mt-1 min-h-24 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" maxLength={1000} value={draft.body} onChange={(event) => patch(item.id, { body: event.target.value })} /></label>
          <label className="text-sm">링크 문구<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" maxLength={80} value={draft.linkLabel} onChange={(event) => patch(item.id, { linkLabel: event.target.value })} /></label>
          <label className="text-sm">링크 주소<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" value={draft.linkHref} placeholder="/ems" onChange={(event) => patch(item.id, { linkHref: event.target.value })} /><span className="mt-1 block text-xs text-hud-text-muted">{linkHelp}</span></label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className="rounded-lg border border-hud-border-secondary px-4 py-2 text-sm" disabled={busy === item.id} onClick={() => patch(item.id, toDraft(item))}>취소</button>{item.kind === "story" && <button className="rounded-lg border border-hud-border-secondary px-4 py-2 text-sm" disabled={busy === item.id} onClick={() => void removeStory(item)}>삭제</button>}<button className="rounded-lg bg-hud-accent-primary px-4 py-2 text-sm font-semibold text-hud-bg-primary disabled:opacity-50" disabled={busy === item.id} onClick={() => void save(item)}>{busy === item.id ? "저장 중" : "저장"}</button></div>
      </article>;
    })}
    <article className="hud-card rounded-2xl p-5"><h3 className="mb-4 text-lg font-semibold">음악 이야기 추가</h3><div className="grid gap-4 lg:grid-cols-2">
      <label className="text-sm">제목<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" maxLength={160} value={fresh.title} onChange={(event) => setFresh({ ...fresh, title: event.target.value })} /></label>
      <label className="text-sm">순서<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" min={0} max={9999} type="number" value={fresh.sortOrder} onChange={(event) => setFresh({ ...fresh, sortOrder: Number(event.target.value) })} /></label>
      <label className="text-sm lg:col-span-2">본문<textarea className="mt-1 min-h-24 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" maxLength={1000} value={fresh.body} onChange={(event) => setFresh({ ...fresh, body: event.target.value })} /></label>
      <label className="text-sm">링크 문구<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" maxLength={80} value={fresh.linkLabel} onChange={(event) => setFresh({ ...fresh, linkLabel: event.target.value })} /></label>
      <label className="text-sm">링크 주소<input className="mt-1 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 py-2" value={fresh.linkHref} placeholder="/ems" onChange={(event) => setFresh({ ...fresh, linkHref: event.target.value })} /><span className="mt-1 block text-xs text-hud-text-muted">{linkHelp}</span></label>
    </div><button className="mt-4 rounded-lg bg-hud-accent-primary px-4 py-2 text-sm font-semibold text-hud-bg-primary disabled:opacity-50" disabled={busy === "new" || !fresh.title.trim() || !fresh.body.trim()} onClick={() => void addStory()}>이야기 추가</button></article>
  </section>;
}
