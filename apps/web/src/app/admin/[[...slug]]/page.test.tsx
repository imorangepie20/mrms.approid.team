import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import AdminPage from "./page";

it("renders the admin shell without user navigation", () => {
  render(<AdminPage />);

  expect(screen.getByTestId("admin-root")).toBeInTheDocument();
  expect(screen.getByTestId("admin-app-script")).toHaveAttribute(
    "src",
    "/admin/assets/index.js",
  );
  expect(screen.getByTestId("admin-app-style")).toHaveAttribute(
    "href",
    "/admin/assets/index.css",
  );
});
