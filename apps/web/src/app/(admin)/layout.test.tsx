import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import AdminRootLayout from "./layout";

it("renders the admin shell without the user navigation or global player", () => {
  render(AdminRootLayout({ children: <div data-testid="admin-content">admin</div> }));

  expect(screen.getByTestId("admin-content")).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("전역 음악 플레이어")).not.toBeInTheDocument();
});
