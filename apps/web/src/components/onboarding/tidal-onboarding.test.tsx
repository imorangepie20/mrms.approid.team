import { render, screen, waitFor } from "@testing-library/react";
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

  it("opens MMS when import completes while enrichment remains", async () => {
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
        });
      }
      if (url === "/api/musicbrainz/enrich") {
        return json({ processed: true, remaining: 11 });
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
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        "/api/musicbrainz/enrich",
        expect.objectContaining({ method: "POST" }),
      ),
    );
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
