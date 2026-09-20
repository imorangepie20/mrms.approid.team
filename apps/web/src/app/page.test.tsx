import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import HomePage from "./page";

it("renders the Music Pie discovery heading", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { name: /music pie/i }),
  ).toBeInTheDocument();
});
