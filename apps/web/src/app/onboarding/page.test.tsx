import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import OnboardingPage from "./page";

it("presents the dashboard onboarding context alongside the TIDAL connection flow", () => {
  render(<OnboardingPage />);

  expect(screen.getByRole("heading", { name: "당신의 음악으로 시작하는 공간" })).toBeInTheDocument();
  expect(screen.getByText("플레이리스트 선택")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "TIDAL 연결하기" })).toHaveAttribute(
    "href",
    "/api/tidal/connect",
  );
});
