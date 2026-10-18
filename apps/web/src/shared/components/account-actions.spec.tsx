import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountActions } from "./account-actions";

describe("AccountActions", () => {
  it("shows the uploaded avatar in the authenticated account link", () => {
    render(
      <AccountActions
        isAuthenticated
        isSigningOut={false}
        avatarUrl="/api/avatars/00000000-0000-4000-8000-000000000001.webp"
        onSignOut={vi.fn()}
        variant="site"
      />,
    );

    const accountLink = screen.getByRole("link", { name: "Mi cuenta" });
    expect(accountLink.querySelector("img")).toHaveAttribute(
      "src",
      "/api/avatars/00000000-0000-4000-8000-000000000001.webp",
    );
  });
});
