import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import AdminPage from "./page";

it("renders the admin shell without user navigation", () => {
  render(<AdminPage />);

  expect(screen.getByTestId("admin-root")).toHaveAttribute("id", "root");
  expect(screen.getByTestId("admin-app-script").getAttribute("src"))
    .toMatch(/^\/admin\/assets\/index-[\w-]+\.js$/);
  expect(screen.getByTestId("admin-app-style").getAttribute("href"))
    .toMatch(/^\/admin\/assets\/style-[\w-]+\.css$/);
});
