import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { TidalConnectionActions } from "./tidal-connection-actions";

afterEach(() => vi.unstubAllGlobals());

it("confirms that saved music stays and reports retained counts", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      playlistCount: 3,
      status: "disconnected",
      trackCount: 80,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<TidalConnectionActions />);

  await user.click(screen.getByRole("button", { name: "TIDAL 연결 해제" }));
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "저장한 음악과 MMS는 유지되고 이후 TIDAL 동기화만 중단됩니다",
  );
  await user.click(screen.getByRole("button", { name: "연결 해제 확인" }));

  expect(await screen.findByRole("status")).toHaveTextContent(
    "플레이리스트 3개와 트랙 80곡은 그대로 유지됩니다",
  );
  expect(fetcher).toHaveBeenCalledWith(
    "/api/tidal/disconnect",
    expect.objectContaining({ method: "POST" }),
  );
});
