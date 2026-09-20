import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TidalEmbedDialog } from "./tidal-embed-dialog";

describe("TidalEmbedDialog", () => {
  it("renders official TIDAL playback and browse links", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <TidalEmbedDialog
        kind="track"
        onClose={onClose}
        resourceId="track/1"
        title="Track A"
      />,
    );

    expect(screen.getByRole("dialog", { name: "TIDAL 플레이어" })).toBeInTheDocument();
    expect(screen.getByTitle("Track A TIDAL 플레이어")).toHaveAttribute(
      "src",
      "https://embed.tidal.com/tracks/track%2F1",
    );
    expect(screen.getByRole("link", { name: "TIDAL에서 열기" })).toHaveAttribute(
      "href",
      "https://tidal.com/browse/track/track%2F1",
    );

    await user.click(screen.getByRole("button", { name: "TIDAL 플레이어 닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
