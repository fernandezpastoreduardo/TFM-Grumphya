import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieNotice } from "./cookie-notice";

const NOTICE_BUTTON_NAME = "Entendido";
const PRIVACY_LINK_NAME = "Leer la política de privacidad";
const NOTICE_ACKNOWLEDGED_KEY = "grumphya.privacy-notice.acknowledged.v1";

describe("CookieNotice", () => {
  beforeEach(() => {
    window.localStorage.removeItem(NOTICE_ACKNOWLEDGED_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains the first-party storage and links to the full policy", () => {
    render(<CookieNotice />);

    expect(
      screen.getByRole("dialog", { name: "Ni galletitas ni galletitos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /No usamos publicidad, analítica ni cookies de terceros/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/almacenamiento local del navegador/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: PRIVACY_LINK_NAME }),
    ).toHaveAttribute("href", "/politica-de-privacidad");
    expect(
      screen.getByRole("img", {
        name: "Grumphya le da una patada a una galleta",
      }),
    ).toBeInTheDocument();
  });

  it("closes when the user acknowledges the notice", async () => {
    const user = userEvent.setup();
    render(<CookieNotice />);

    await user.click(screen.getByRole("button", { name: NOTICE_BUTTON_NAME }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus into the notice and restores it when closed", async () => {
    const user = userEvent.setup();
    const opener = document.createElement("button");
    opener.textContent = "Abrir aviso";
    document.body.append(opener);
    opener.focus();
    render(<CookieNotice />);

    const noticeButton = screen.getByRole("button", {
      name: NOTICE_BUTTON_NAME,
    });
    expect(noticeButton).toHaveFocus();

    await user.click(noticeButton);

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("closes with Escape and traps keyboard focus between the link and button", async () => {
    const user = userEvent.setup();
    render(<CookieNotice />);

    const noticeButton = screen.getByRole("button", {
      name: NOTICE_BUTTON_NAME,
    });
    const privacyLink = screen.getByRole("link", { name: PRIVACY_LINK_NAME });

    expect(noticeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(privacyLink).toHaveFocus();
    await user.tab();
    expect(noticeButton).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stores only that the information notice was acknowledged", async () => {
    const user = userEvent.setup();
    render(<CookieNotice />);

    await user.click(screen.getByRole("button", { name: NOTICE_BUTTON_NAME }));

    expect(window.localStorage.getItem(NOTICE_ACKNOWLEDGED_KEY)).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the notice available when browser storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    render(<CookieNotice />);

    expect(
      screen.getByRole("dialog", { name: "Ni galletitas ni galletitos" }),
    ).toBeInTheDocument();
  });

  it("still closes the notice when browser storage cannot be written", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<CookieNotice />);

    await user.click(screen.getByRole("button", { name: NOTICE_BUTTON_NAME }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
