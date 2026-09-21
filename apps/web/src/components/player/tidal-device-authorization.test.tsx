import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { TidalDeviceAuthorization } from "./tidal-device-authorization";

it("shows a device code and reports a connected token", async () => {
  const onConnected = vi.fn();
  let resolvePoll!: (response: Response) => void;
  const pollResponse = new Promise<Response>((resolve) => {
    resolvePoll = resolve;
  });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({
      deviceCode: "device-1",
      expiresAt: "2026-09-22T00:00:00.000Z",
      intervalSeconds: 0,
      userCode: "ABCD",
      verificationUri: "https://link.tidal.com",
      verificationUriComplete: "https://link.tidal.com/ABCD",
    }))
    .mockReturnValueOnce(pollResponse);
  const user = userEvent.setup();

  render(<TidalDeviceAuthorization fetcher={fetcher} onConnected={onConnected} />);
  await user.click(screen.getByRole("button", { name: "TIDAL 재생 연결" }));

  expect(await screen.findByText("ABCD")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "TIDAL 인증 열기" })).toHaveAttribute(
    "href", "https://link.tidal.com/ABCD",
  );
  resolvePoll(Response.json({ status: "connected" }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog", { name: "TIDAL 재생 연결" })).not.toBeInTheDocument();
});

it("explains when the configured client cannot use device authorization", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({
    code: "tidal_device_client_unsupported",
  }, { status: 409 }));
  const user = userEvent.setup();

  render(<TidalDeviceAuthorization fetcher={fetcher} />);
  await user.click(screen.getByRole("button", { name: "TIDAL 재생 연결" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "TIDAL Limited Input Device 클라이언트 설정이 필요합니다.",
  );
  expect(screen.queryByRole("link", { name: "TIDAL 권한 다시 연결" })).not.toBeInTheDocument();
});

it("renders the authorization dialog outside the persistent player container", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({
    deviceCode: "device-1",
    expiresAt: "2026-09-22T00:00:00.000Z",
    intervalSeconds: 30,
    userCode: "ABCD",
    verificationUri: "https://link.tidal.com",
    verificationUriComplete: "https://link.tidal.com/ABCD",
  }));
  const user = userEvent.setup();

  render(
    <aside data-testid="persistent-player">
      <TidalDeviceAuthorization fetcher={fetcher} />
    </aside>,
  );
  await user.click(screen.getByRole("button", { name: "TIDAL 재생 연결" }));

  const dialog = await screen.findByRole("dialog", { name: "TIDAL 재생 연결" });
  expect(dialog.parentElement).toBe(document.body);
});
