import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TidalOnboarding } from "./tidal-onboarding";

function json(body: unknown, status = 200) {
  return Promise.resolve(Response.json(body, { status }));
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("TidalOnboarding", () => {
  it("loads TIDAL playlists after a connected callback", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    const fetcher = vi.fn(() =>
      json({
        playlists: [
          {
            artworkUrl: null,
            description: null,
            id: "p-1",
            name: "Morning Focus",
            saved: false,
            trackCount: 38,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    expect(
      await screen.findByRole("checkbox", { name: /Morning Focus/i }),
    ).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/tidal/playlists",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not advance when no playlist is selected", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    vi.stubGlobal("fetch", vi.fn(() => json({ playlists: [] })));
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await screen.findByText("가져올 플레이리스트가 없습니다.");
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "플레이리스트를 하나 이상 선택해 주세요",
    );
  });

  it("shows the estimated track count and recommendation readiness while selecting playlists", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    vi.stubGlobal("fetch", vi.fn(() => json({
      playlists: [
        {
          artworkUrl: null,
          description: null,
          id: "p-1",
          name: "Morning Focus",
          saved: false,
          trackCount: 10,
        },
        {
          artworkUrl: null,
          description: null,
          id: "p-2",
          name: "Evening Drive",
          saved: false,
          trackCount: 14,
        },
      ],
    })));
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await user.click(await screen.findByRole("checkbox", { name: /Morning Focus/i }));
    await user.click(screen.getByRole("checkbox", { name: /Evening Drive/i }));

    expect(screen.getByText("선택 예상 트랙 24곡")).toBeInTheDocument();
    expect(screen.getByText("최소 기준 15곡 달성")).toBeInTheDocument();
    expect(screen.getByText("더 정확한 추천까지 6곡 남았어요")).toBeInTheDocument();
  });

  it.each([
    [30, "첫 추천을 만들기에 충분해요"],
    [60, "여러 음악 취향을 나누어 분석할 수 있어요"],
  ])("shows the readiness state at %i selected tracks", async (trackCount, message) => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    vi.stubGlobal("fetch", vi.fn(() => json({
      playlists: [{
        artworkUrl: null,
        description: null,
        id: `p-${trackCount}`,
        name: `${trackCount} Tracks`,
        saved: false,
        trackCount,
      }],
    })));
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await user.click(await screen.findByRole("checkbox", { name: new RegExp(`${trackCount} Tracks`) }));

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("runs embedding batches only after MusicBrainz enrichment reaches zero", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") {
        return json({
          playlists: [
            {
              artworkUrl: null,
              description: null,
              id: "p-1",
              name: "Morning Focus",
              saved: false,
              trackCount: 38,
            },
          ],
        });
      }
      if (url === "/api/playlists/import" && init?.method === "POST") {
        return json({ importId: "import-1" }, 202);
      }
      if (url === "/api/playlists/import/import-1") {
        return json({
          enrichmentPendingCount: 12,
          savedPlaylistCount: 1,
          savedTrackCount: 38,
          status: "completed",
          uniqueTrackCount: 38,
        });
      }
      if (url === "/api/musicbrainz/enrich") {
        return json({ processed: true, remaining: 0 });
      }
      if (url === "/api/recommendations/analyze") {
        return json({
          embeddedTrackCount: 38,
          failedTrackCount: 0,
          profileReady: true,
          remaining: 0,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await user.click(
      await screen.findByRole("checkbox", { name: /Morning Focus/i }),
    );
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(
      await screen.findByText("MMS와 첫 추천이 준비됐어요"),
    ).toBeInTheDocument();
    expect(screen.getByText(/38곡을 저장/)).toBeInTheDocument();
    const urls = fetcher.mock.calls.map(([input]) => String(input));
    expect(urls.indexOf("/api/musicbrainz/enrich")).toBeLessThan(
      urls.indexOf("/api/recommendations/analyze"),
    );
  });

  it("shows embedded and remaining counts while analysis runs", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") {
        return json({ playlists: [{ artworkUrl: null, description: null, id: "p-1", name: "Focus", saved: false, trackCount: 38 }] });
      }
      if (url === "/api/playlists/import") return json({ importId: "import-progress" }, 202);
      if (url === "/api/playlists/import/import-progress") {
        return json({ enrichmentPendingCount: 0, savedPlaylistCount: 1, savedTrackCount: 38, status: "completed", uniqueTrackCount: 38 });
      }
      return json({ embeddedTrackCount: 16, failedTrackCount: 0, profileReady: false, remaining: 22 });
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await user.click(await screen.findByRole("checkbox", { name: /Focus/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(await screen.findByText(/16곡 분석 완료/)).toBeInTheDocument();
    expect(screen.getByText(/22곡 남음/)).toBeInTheDocument();
    expect(screen.queryByText("MMS와 첫 추천이 준비됐어요")).not.toBeInTheDocument();
  });

  it("shows recommendation ready only after profileReady is true", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    let analysisCalls = 0;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") return json({ playlists: [{ artworkUrl: null, description: null, id: "p-1", name: "Ready", saved: false, trackCount: 38 }] });
      if (url === "/api/playlists/import") return json({ importId: "import-ready" }, 202);
      if (url === "/api/playlists/import/import-ready") return json({ enrichmentPendingCount: 0, savedPlaylistCount: 1, savedTrackCount: 38, status: "completed", uniqueTrackCount: 38 });
      analysisCalls += 1;
      return json({ embeddedTrackCount: analysisCalls * 16, failedTrackCount: 0, profileReady: analysisCalls > 1, remaining: analysisCalls > 1 ? 0 : 22 });
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);
    await user.click(await screen.findByRole("checkbox", { name: /Ready/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(await screen.findByText(/16곡 분석 완료/)).toBeInTheDocument();
    expect(screen.queryByText("MMS와 첫 추천이 준비됐어요")).not.toBeInTheDocument();
    expect(await screen.findByText("MMS와 첫 추천이 준비됐어요")).toBeInTheDocument();
  });

  it("keeps saved MMS and offers analysis retry after a 503 response", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") return json({ playlists: [{ artworkUrl: null, description: null, id: "p-1", name: "Retry", saved: false, trackCount: 38 }] });
      if (url === "/api/playlists/import") return json({ importId: "import-retry" }, 202);
      if (url === "/api/playlists/import/import-retry") return json({ enrichmentPendingCount: 0, savedPlaylistCount: 1, savedTrackCount: 38, status: "completed", uniqueTrackCount: 38 });
      return json({ code: "embedding_service_unavailable" }, 503);
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);
    await user.click(await screen.findByRole("checkbox", { name: /Retry/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(await screen.findByText("MMS는 저장됐어요. 취향 분석을 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분석 다시 시도" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MMS 보러 가기" })).toHaveAttribute("href", "/mms");
  });

  it("resumes remaining jobs after retry without starting another playlist import", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    let analysisCalls = 0;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") return json({ playlists: [{ artworkUrl: null, description: null, id: "p-1", name: "Resume", saved: false, trackCount: 38 }] });
      if (url === "/api/playlists/import") return json({ importId: "import-resume" }, 202);
      if (url === "/api/playlists/import/import-resume") return json({ enrichmentPendingCount: 0, savedPlaylistCount: 1, savedTrackCount: 38, status: "completed", uniqueTrackCount: 38 });
      analysisCalls += 1;
      return analysisCalls === 1
        ? json({ code: "embedding_service_unavailable" }, 503)
        : json({ embeddedTrackCount: 38, failedTrackCount: 0, profileReady: true, remaining: 0 });
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);
    await user.click(await screen.findByRole("checkbox", { name: /Resume/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));
    await screen.findByRole("button", { name: "분석 다시 시도" });
    await user.click(screen.getByRole("button", { name: "분석 다시 시도" }));

    expect(await screen.findByText("MMS와 첫 추천이 준비됐어요")).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([input]) => String(input) === "/api/playlists/import")).toHaveLength(1);
  });

  it("keeps recommendation setup open when fewer than 15 unique tracks were imported", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") {
        return json({
          playlists: [{
            artworkUrl: null,
            description: null,
            id: "short",
            name: "Short List",
            saved: false,
            trackCount: 20,
          }],
        });
      }
      if (url === "/api/playlists/import") {
        return json({ importId: "import-short" }, 202);
      }
      return json({
        enrichmentPendingCount: 0,
        savedPlaylistCount: 1,
        savedTrackCount: 20,
        status: "completed",
        uniqueTrackCount: 14,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await user.click(await screen.findByRole("checkbox", { name: /Short List/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "취향 분석을 시작하려면 고유 트랙이 최소 15곡 필요해요",
    );
    expect(screen.queryByText("MMS와 첫 추천이 준비됐어요")).not.toBeInTheDocument();
  });

  it("does not complete MMS when imported playlists contain no tracks", async () => {
    window.history.replaceState({}, "", "/onboarding?tidal=connected");
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tidal/playlists") {
        return json({
          playlists: [
            {
              artworkUrl: null,
              description: null,
              id: "empty",
              name: "빈 플레이리스트",
              saved: false,
              trackCount: 0,
            },
          ],
        });
      }
      if (url === "/api/playlists/import") {
        return json({ importId: "import-empty" }, 202);
      }
      return json({
        enrichmentPendingCount: 0,
        savedPlaylistCount: 1,
        savedTrackCount: 0,
        status: "completed",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<TidalOnboarding connectHref="/api/tidal/connect" />);

    await user.click(
      await screen.findByRole("checkbox", { name: /빈 플레이리스트/i }),
    );
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "가져온 트랙이 없습니다",
    );
    expect(
      screen.queryByText("MMS와 첫 추천이 준비됐어요"),
    ).not.toBeInTheDocument();
  });

  it("shows a retry action when TIDAL connection fails", async () => {
    const user = userEvent.setup();
    const connect = vi.fn().mockRejectedValue(new Error("connection failed"));

    render(<TidalOnboarding onConnect={connect} />);
    await user.click(screen.getByRole("button", { name: "TIDAL 연결하기" }));

    expect(screen.getByRole("alert")).toHaveTextContent("연결에 실패했습니다");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});
