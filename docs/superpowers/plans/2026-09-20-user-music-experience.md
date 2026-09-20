# User Music Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a testable Next.js user-facing music experience for EMS discovery, TIDAL onboarding, GMS decisions, MMS, and persistent playback.

**Architecture:** Create a user web app in `apps/web` while retaining the provided Vite template for the separate administrator application. The first vertical slice uses typed in-memory repositories behind a context provider; UI actions update the same user-scoped EMS/GMS/MMS state that future API adapters will replace.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Vitest, React Testing Library, Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-20-user-experience-storyboard-design.md`

## Global Constraints

- The administrator frontend remains the copied React + Vite template at `C:\Wspace\hud-admin-template`; this plan builds only the user-facing Next.js app.
- 비로그인 사용자는 EMS 탐색을 이용하고, TIDAL 온보딩·GMS·MMS·저장·선호 판정에는 로그인을 요구한다.
- Keep playback state across route transitions in a client-side provider.
- 고정 하단 플레이어는 데스크톱에서 전체 제어를, 모바일에서 미니 플레이어와 전체 화면 확장을 제공한다.
- A user-scoped rejection must remove that track from MMS and every future GMS candidate query, without altering EMS or other users.
- Use real album-art image URLs only after source permissions are confirmed; the initial fixture data uses local gradient artwork.

## Review Focus

- A rejected track must never reappear in GMS after navigation or a state refresh.
- A guest must not reach MMS or persist a preference merely by entering a protected URL.
- A route transition must not reset the current track, playback flag, position, or queue.
- A selected TIDAL playlist with zero tracks must show a useful onboarding result rather than create an unusable MMS.
- Fixed playback controls and mobile navigation must not obscure the last item in a scrollable track list.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/web/src/lib/music/types.ts` | EMS, GMS, MMS, action, and playback type definitions |
| `apps/web/src/lib/music/fixtures.ts` | Deterministic public tracks and playlists for the first UI slice |
| `apps/web/src/lib/music/recommendations.ts` | User-scoped recommendation and permanent-exclusion functions |
| `apps/web/src/providers/music-session-provider.tsx` | Client state for session, MMS, GMS, exclusions, and playback |
| `apps/web/src/components/player/*` | Persistent player, queue, and full-player dialog |
| `apps/web/src/components/music/*` | Reusable track cards, rails, and preference controls |
| `apps/web/src/app/*` | Public home, onboarding, GMS, MMS, and protected route pages |
| `apps/web/src/**/*.test.tsx` | Unit and interaction tests colocated with their UI or state module |

### Task 1: Create the user web workspace and test harness ✅

**Files:**
- Create: `apps/web/` via Next.js initializer
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `npm run dev`, `npm run lint`, `npm run test`, and `npm run build` in `apps/web`.

- [ ] **Step 1: Initialize the app without touching the administrator template**

Run from repository root:

```powershell
npx create-next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*"
```

Expected: `apps/web/package.json` exists and `C:\Wspace\hud-admin-template` is unchanged.

- [ ] **Step 2: Add a failing smoke test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import HomePage from './page'

it('renders the Music Pie discovery heading', () => {
  render(<HomePage />)
  expect(screen.getByRole('heading', { name: /music pie/i })).toBeInTheDocument()
})
```

- [ ] **Step 3: Configure Vitest and run the failing test**

Add `test` and `test:watch` scripts using `vitest run` and `vitest`; configure jsdom, `@testing-library/jest-dom/vitest`, and the `@/*` alias. Then run:

```powershell
Set-Location apps/web
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm run test -- src/app/page.test.tsx
```

Expected: FAIL because the default page does not contain the required heading.

- [ ] **Step 4: Replace the default page with the minimal Music Pie heading**

```tsx
export default function HomePage() {
  return <main><h1>Music Pie</h1></main>
}
```

- [ ] **Step 5: Verify baseline tooling**

```powershell
npm run test -- src/app/page.test.tsx
npm run lint
npm run build
```

Expected: all commands exit with code 0.

### Task 2: Define user-scoped music state and recommendation rules ✅

**Files:**
- Create: `apps/web/src/lib/music/types.ts`
- Create: `apps/web/src/lib/music/fixtures.ts`
- Create: `apps/web/src/lib/music/recommendations.ts`
- Create: `apps/web/src/lib/music/recommendations.test.ts`

**Interfaces:**
- Produces: `getGatewayTracks(catalog, mmsTrackIds, rejectedTrackIds): Track[]` and `applyPreference(state, trackId, preference): MusicState`.
- Consumed by: session provider, GMS page, MMS page.

- [ ] **Step 1: Write permanent-exclusion tests**

```ts
it('excludes a rejected track from future gateway tracks', () => {
  const tracks = getGatewayTracks(catalog, ['t-1'], ['t-3'])
  expect(tracks.map((track) => track.id)).not.toContain('t-3')
})

it('does not remove a rejected track from the public catalog', () => {
  const next = applyPreference(initialState, 't-3', 'reject')
  expect(catalog.map((track) => track.id)).toContain('t-3')
  expect(next.rejectedTrackIds).toContain('t-3')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npm run test -- src/lib/music/recommendations.test.ts
```

Expected: FAIL because the recommendation module does not exist.

- [ ] **Step 3: Implement the small typed domain model**

```ts
export type Preference = 'accept' | 'reject'
export type Track = { id: string; title: string; artist: string; album: string; artworkClass: string }
export type MusicState = { mmsTrackIds: string[]; rejectedTrackIds: string[] }

export function getGatewayTracks(catalog: Track[], mmsTrackIds: string[], rejectedTrackIds: string[]) {
  return catalog.filter((track) => !mmsTrackIds.includes(track.id) && !rejectedTrackIds.includes(track.id))
}
```

Implement `applyPreference` so `accept` adds a unique track ID to `mmsTrackIds`; `reject` removes it from `mmsTrackIds` and adds a unique ID to `rejectedTrackIds`.

- [ ] **Step 4: Verify recommendation behavior**

```powershell
npm run test -- src/lib/music/recommendations.test.ts
```

Expected: PASS with both acceptance and rejection cases.

### Task 3: Add a persistent session and playback provider ✅

**Files:**
- Create: `apps/web/src/providers/music-session-provider.tsx`
- Create: `apps/web/src/providers/music-session-provider.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: `useMusicSession()` with `isAuthenticated`, `currentTrack`, `isPlaying`, `queue`, `playTrack`, `togglePlayback`, `acceptTrack`, `rejectTrack`, and `connectTidal`.
- Consumes: `Track`, `MusicState`, and recommendation functions from Task 2.

- [ ] **Step 1: Write the playback persistence test**

```tsx
it('keeps the playing track when a child route unmounts', async () => {
  const user = userEvent.setup()
  render(<ProviderHarness />)
  await user.click(screen.getByRole('button', { name: /play midnight city/i }))
  expect(screen.getByText(/now playing: midnight city/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /switch route/i }))
  expect(screen.getByText(/now playing: midnight city/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test -- src/providers/music-session-provider.test.tsx
```

Expected: FAIL because `MusicSessionProvider` does not exist.

- [ ] **Step 3: Implement the provider at the root layout boundary**

```tsx
export function MusicSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playTrack = (track: Track) => { setCurrentTrack(track); setIsPlaying(true) }
  return <MusicSessionContext.Provider value={{ currentTrack, isPlaying, playTrack }}>{children}</MusicSessionContext.Provider>
}
```

Wrap `children` in `src/app/layout.tsx` with this client provider; keep the provider outside individual route pages.

- [ ] **Step 4: Verify provider behavior**

```powershell
npm run test -- src/providers/music-session-provider.test.tsx
```

Expected: PASS; changing rendered child content does not clear playback state.

### Task 4: Build public discovery and the progressive sign-in gate ✅

**Files:**
- Create: `apps/web/src/components/music/track-card.tsx`
- Create: `apps/web/src/components/music/music-rail.tsx`
- Create: `apps/web/src/components/auth/sign-in-gate.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/page.test.tsx`

**Interfaces:**
- Consumes: fixture tracks and `useMusicSession()`.
- Produces: public EMS rails and a sign-in dialog invoked by protected actions.

- [ ] **Step 1: Write guest-access tests**

```tsx
it('shows public discovery rails to a guest', () => {
  render(<HomePage />)
  expect(screen.getByRole('heading', { name: '최신곡' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '플랫폼별 플레이리스트' })).toBeInTheDocument()
})

it('opens a sign-in gate instead of saving for a guest', async () => {
  const user = userEvent.setup()
  render(<HomePage />)
  await user.click(screen.getByRole('button', { name: /내 음악에 담기/i }))
  expect(screen.getByRole('dialog', { name: /tidal 연결/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npm run test -- src/app/page.test.tsx
```

Expected: FAIL because the public rails and dialog are absent.

- [ ] **Step 3: Implement the exploration-first home**

Render `최신곡`, `최신 플레이리스트`, `플랫폼별 플레이리스트`, `당신을 위한 추천`, and `이어 듣기` as reusable `MusicRail` sections. `TrackCard` must expose accessible `재생 {title}` and `내 음악에 담기 {title}` button names. For a guest, the second action opens `SignInGate` with a `내 취향으로 추천받기` CTA.

- [ ] **Step 4: Verify guest behavior and responsive padding**

```powershell
npm run test -- src/app/page.test.tsx
npm run lint
```

Expected: PASS; the page has bottom padding at least equal to the fixed-player height.

### Task 5: Implement TIDAL onboarding and MMS initialization

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/components/onboarding/tidal-onboarding.tsx`
- Create: `apps/web/src/components/onboarding/tidal-onboarding.test.tsx`

**Interfaces:**
- Consumes: `connectTidal(selectedPlaylistIds: string[]): Promise<void>` from `useMusicSession()`.
- Produces: three explicit states: connection, playlist selection, MMS creation.

- [ ] **Step 1: Write the empty-playlist test**

```tsx
it('does not advance when no playlist is selected', async () => {
  const user = userEvent.setup()
  render(<TidalOnboarding playlists={[]} />)
  await user.click(screen.getByRole('button', { name: /mms 만들기/i }))
  expect(screen.getByText(/플레이리스트를 하나 이상 선택/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test -- src/components/onboarding/tidal-onboarding.test.tsx
```

Expected: FAIL because onboarding does not exist.

- [ ] **Step 3: Implement the three-screen sequence**

Use a local `step: 'connect' | 'select' | 'complete'` state. The connect screen calls `connectTidal`; the selection screen uses checked inputs with visible playlist names; the completion screen confirms that MMS and first recommendations are ready and links to `/gms`.

- [ ] **Step 4: Verify success and failure paths**

```powershell
npm run test -- src/components/onboarding/tidal-onboarding.test.tsx
```

Expected: PASS for empty selection, selected playlist, and a rejected connection promise with retry UI.

### Task 6: Implement GMS decisions, MMS, and permanent exclusion management

**Files:**
- Create: `apps/web/src/app/gms/page.tsx`
- Create: `apps/web/src/app/mms/page.tsx`
- Create: `apps/web/src/components/music/preference-actions.tsx`
- Create: `apps/web/src/components/music/preference-actions.test.tsx`

**Interfaces:**
- Consumes: `acceptTrack(trackId)`, `rejectTrack(trackId)`, `getGatewayTracks`, and session state.
- Produces: user-scoped GMS cards, MMS track list, exclusion confirmation, undo, and excluded-track management.

- [ ] **Step 1: Write GMS decision tests**

```tsx
it('adds an accepted track to MMS', async () => {
  const user = userEvent.setup()
  render(<GatewayTrack track={track} />)
  await user.click(screen.getByRole('button', { name: /mms에 담기/i }))
  expect(screen.getByText(/mms에 추가됨/i)).toBeInTheDocument()
})

it('removes a rejected track from GMS after confirmation', async () => {
  const user = userEvent.setup()
  render(<GatewayTrack track={track} />)
  await user.click(screen.getByRole('button', { name: /다시 추천하지 않기/i }))
  await user.click(screen.getByRole('button', { name: /영구 제외 확인/i }))
  expect(screen.queryByText(track.title)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npm run test -- src/components/music/preference-actions.test.tsx
```

Expected: FAIL because the GMS components and actions are absent.

- [ ] **Step 3: Implement explicit and accessible decisions**

Render `MMS에 담기` and `다시 추천하지 않기` as visible buttons. Require a confirmation dialog for rejection, then show an `되돌리기` action that reverses the rejection only in the current session. Add an MMS settings section listing excluded tracks with a `추천 제외 해제` action.

- [ ] **Step 4: Verify GMS/MMS behavior**

```powershell
npm run test -- src/components/music/preference-actions.test.tsx
```

Expected: PASS; a rejected ID stays absent from the GMS list and acceptance appears in MMS.

### Task 7: Add the persistent player and complete end-to-end UI verification

**Files:**
- Create: `apps/web/src/components/player/persistent-player.tsx`
- Create: `apps/web/src/components/player/full-player-dialog.tsx`
- Create: `apps/web/src/components/player/persistent-player.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: playback state and queue from `useMusicSession()`.
- Produces: root-level fixed player with a mobile mini-player and expandable full-player dialog.

- [ ] **Step 1: Write player interaction tests**

```tsx
it('opens the full player from the persistent player', async () => {
  const user = userEvent.setup()
  render(<PersistentPlayer />)
  await user.click(screen.getByRole('button', { name: /now playing midnight city/i }))
  expect(screen.getByRole('dialog', { name: /전체 화면 플레이어/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test -- src/components/player/persistent-player.test.tsx
```

Expected: FAIL because no persistent player exists.

- [ ] **Step 3: Implement root-level playback UI**

Mount `PersistentPlayer` beside page children in `src/app/layout.tsx`, not inside a route page. Use `fixed bottom-0 inset-x-0` styling, reserve matching bottom padding on page content, and render play/pause, previous, next, position, queue, and an accessible full-player trigger.

- [ ] **Step 4: Run the full verification suite**

```powershell
npm run test
npm run lint
npm run build
```

Expected: all commands exit with code 0; guest gate, onboarding, GMS/MMS, permanent exclusion, and player tests pass.

## Plan Self-Review

- Spec coverage: Tasks 4–7 cover public discovery, onboarding, GMS, MMS, persistent playback, responsive layout, and user feedback states. Task 2 enforces EMS preservation and user-scoped permanent exclusion.
- Placeholder scan: no unresolved implementation placeholders are included; TIDAL playback capability is explicitly isolated behind the session adapter and does not block the UI slice.
- Type consistency: `Track`, `MusicState`, `Preference`, and `useMusicSession()` are introduced before pages and components consume them.
- Review focus: permanent rejection is tested in Tasks 2 and 6; guest access in Task 4; playback persistence in Tasks 3 and 7; empty onboarding selection in Task 5; fixed-player overlap in Task 4 and Task 7.
