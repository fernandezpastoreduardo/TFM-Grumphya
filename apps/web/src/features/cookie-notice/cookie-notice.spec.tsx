import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CookieNotice } from "./cookie-notice";

const ACCEPT_BUTTON_NAME = "Aceptar y continuar sin galletas";
const DENY_BUTTON_NAME = "Denegar y continuar sin galletas";

describe("CookieNotice", () => {
  it("explains that only necessary cookies are used", () => {
    render(<CookieNotice />);

    expect(
      screen.getByRole("dialog", { name: "Ni galletitas ni galletitos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/NO usamos cookies de terceros/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Grumphya le da una patada a una galleta",
      }),
    ).toBeInTheDocument();
  });

  it.each([ACCEPT_BUTTON_NAME, DENY_BUTTON_NAME])(
    "closes when the user selects %s",
    async (buttonName) => {
      const user = userEvent.setup();
      render(<CookieNotice />);

      await user.click(screen.getByRole("button", { name: buttonName }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("moves focus into the notice and restores it when closed", async () => {
    const user = userEvent.setup();
    const opener = document.createElement("button");
    opener.textContent = "Abrir aviso";
    document.body.append(opener);
    opener.focus();
    render(<CookieNotice />);

    const acceptButton = screen.getByRole("button", {
      name: ACCEPT_BUTTON_NAME,
    });
    expect(acceptButton).toHaveFocus();

    await user.click(acceptButton);

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("closes with Escape and traps keyboard focus between its buttons", async () => {
    const user = userEvent.setup();
    render(<CookieNotice />);

    const acceptButton = screen.getByRole("button", {
      name: ACCEPT_BUTTON_NAME,
    });
    const denyButton = screen.getByRole("button", { name: DENY_BUTTON_NAME });

    expect(acceptButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(denyButton).toHaveFocus();
    await user.tab();
    expect(acceptButton).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not persist the choice in cookies or browser storage", async () => {
    const user = userEvent.setup();
    const localStorageWrite = vi.spyOn(Storage.prototype, "setItem");
    const startingCookie = document.cookie;
    render(<CookieNotice />);

    await user.click(screen.getByRole("button", { name: DENY_BUTTON_NAME }));

    expect(document.cookie).toBe(startingCookie);
    expect(localStorageWrite).not.toHaveBeenCalled();
    localStorageWrite.mockRestore();
  });
});
