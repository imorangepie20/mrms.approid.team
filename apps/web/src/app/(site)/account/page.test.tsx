import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth0", () => ({
  auth0: { getSession: vi.fn() },
}));

import { AccountPageContent } from "./page";

it("shows account identity and TIDAL status without rendering tokens", () => {
  render(
    <AccountPageContent
      tidalStatus="not_connected"
      user={{ email: "listener@example.com", name: "Listener" }}
    />,
  );

  expect(screen.getByRole("heading", { name: "계정" })).toBeInTheDocument();
  expect(screen.getByText("listener@example.com")).toBeInTheDocument();
  expect(screen.getByText("TIDAL 연결 필요")).toBeInTheDocument();
  expect(screen.queryByText(/access token|refresh token/i)).not.toBeInTheDocument();
});

it("offers disconnect while explaining that saved music is retained", () => {
  render(
    <AccountPageContent
      tidalStatus="connected"
      user={{ email: "listener@example.com", name: "Listener" }}
    />,
  );

  expect(screen.getByText("TIDAL 연결됨")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "TIDAL 연결 해제" })).toHaveAttribute(
    "aria-describedby",
    "disconnect-description",
  );
  expect(screen.getByText(/저장한 음악과 MMS는 유지/)).toBeInTheDocument();
});
