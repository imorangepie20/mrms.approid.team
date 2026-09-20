import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { catalog } from "@/lib/music/fixtures";
import { MusicSessionProvider } from "@/providers/music-session-provider";

import { GatewayTrack } from "./preference-actions";

function renderGatewayTrack() {
  return render(
    <MusicSessionProvider>
      <GatewayTrack track={catalog[0]} />
    </MusicSessionProvider>,
  );
}

describe("GatewayTrack", () => {
  it("adds an accepted track to MMS", async () => {
    const user = userEvent.setup();

    renderGatewayTrack();

    await user.click(screen.getByRole("button", { name: "MMS에 담기" }));

    expect(screen.getByText("MMS에 추가했어요")).toBeInTheDocument();
  });

  it("removes a rejected track from GMS after confirmation", async () => {
    const user = userEvent.setup();

    renderGatewayTrack();

    await user.click(screen.getByRole("button", { name: "다시 추천하지 않기" }));
    await user.click(screen.getByRole("button", { name: "영구 제외 확인" }));

    expect(screen.queryByText(catalog[0].title)).not.toBeInTheDocument();
  });
});
