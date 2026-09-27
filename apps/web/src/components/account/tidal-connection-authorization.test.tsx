import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

import { TidalConnectionAuthorization } from "./tidal-connection-authorization";

it("returns to the requested page after the single TIDAL approval", async () => {
  const originalFetch = global.fetch;
  let resolvePoll!: (response: Response) => void;
  const pollResponse = new Promise<Response>((resolve) => {
    resolvePoll = resolve;
  });
  global.fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({
      deviceCode: "device-1",
      expiresAt: "2026-09-22T00:00:00.000Z",
      intervalSeconds: 0,
      userCode: "ABCD",
      verificationUri: "https://link.tidal.com",
      verificationUriComplete: null,
    }))
    .mockReturnValueOnce(pollResponse) as typeof fetch;

  const user = userEvent.setup();
  render(<TidalConnectionAuthorization returnTo="/onboarding?tidal=connected" />);
  await user.click(screen.getByRole("button", { name: "TIDAL 연결하기" }));
  await screen.findByText("ABCD");
  resolvePoll(Response.json({ status: "connected" }));

  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/onboarding?tidal=connected"));
  global.fetch = originalFetch;
});
