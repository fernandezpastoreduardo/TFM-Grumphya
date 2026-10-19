import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("shows account and sign-out actions for an authenticated account", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(
      <AccountActions
        isAuthenticated
        isSigningOut={false}
        onSignOut={onSignOut}
        variant="site"
      />,
    );

    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute(
      "href",
      "/perfil",
    );
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("keeps login and account creation actions for visitors", () => {
    render(
      <AccountActions
        isAuthenticated={false}
        isSigningOut={false}
        onSignOut={vi.fn()}
        variant="site"
      />,
    );

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Crear cuenta" }),
    ).toHaveAttribute("href", "/precios");
  });
});
