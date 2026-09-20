import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthControls } from "./auth-controls";

describe("AuthControls", () => {
  it("sends an anonymous user to the Auth0 login and sign-up routes", () => {
    render(<AuthControls user={null} />);

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/api/auth/login");
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/api/auth/signup");
  });

  it("shows account and logout actions for an authenticated user", () => {
    render(<AuthControls user={{ name: "민지" }} />);

    expect(screen.getByRole("link", { name: "민지" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: "로그아웃" })).toHaveAttribute("href", "/api/auth/logout");
    expect(screen.queryByRole("link", { name: "회원가입" })).not.toBeInTheDocument();
  });
});
