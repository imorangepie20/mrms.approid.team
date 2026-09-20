import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TidalOnboarding } from "./tidal-onboarding";

describe("TidalOnboarding", () => {
  it("does not advance when no playlist is selected", async () => {
    const user = userEvent.setup();

    render(<TidalOnboarding playlists={[]} />);

    await user.click(screen.getByRole("button", { name: "TIDAL 연결하기" }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(
      screen.getByText(/플레이리스트를 하나 이상 선택해 주세요/i),
    ).toBeInTheDocument();
  });

  it("creates MMS after a playlist is selected", async () => {
    const user = userEvent.setup();
    const createMms = vi.fn();

    render(
      <TidalOnboarding
        playlists={[{ id: "p-1", name: "밤 산책", trackCount: 24 }]}
        onCreateMms={createMms}
      />,
    );

    await user.click(screen.getByRole("button", { name: "TIDAL 연결하기" }));
    await user.click(screen.getByRole("checkbox", { name: /밤 산책/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(screen.getByText(/MMS와 첫 추천이 준비됐어요/i)).toBeInTheDocument();
    expect(createMms).toHaveBeenCalledWith(["p-1"]);
  });

  it("does not create MMS from a playlist with no tracks", async () => {
    const user = userEvent.setup();

    render(
      <TidalOnboarding
        playlists={[{ id: "empty", name: "빈 플레이리스트", trackCount: 0 }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "TIDAL 연결하기" }));
    await user.click(screen.getByRole("checkbox", { name: /빈 플레이리스트/i }));
    await user.click(screen.getByRole("button", { name: "MMS 만들기" }));

    expect(screen.getByRole("alert")).toHaveTextContent("분석할 트랙이 없습니다");
  });

  it("shows a retry action when TIDAL connection fails", async () => {
    const user = userEvent.setup();
    const connect = vi.fn().mockRejectedValue(new Error("connection failed"));

    render(<TidalOnboarding playlists={[]} onConnect={connect} />);

    await user.click(screen.getByRole("button", { name: "TIDAL 연결하기" }));

    expect(screen.getByRole("alert")).toHaveTextContent("연결에 실패했습니다");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});
