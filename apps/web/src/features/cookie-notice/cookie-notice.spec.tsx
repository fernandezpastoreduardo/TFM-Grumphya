import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieNotice } from "./cookie-notice";

const NOTICE_BUTTON_NAME = "Entendido";
const PRIVACY_LINK_NAME = "Leer la política de privacidad";
const NOTICE_ACKNOWLEDGED_KEY = "grumphya.privacy-notice.acknowledged.v1";
const ABSTRACT_COOKIE_NOTICE_COPY =
  "Usamos solo cookies propias técnicas, las que sirven para que todo funcione como te mereces. Aquí NO se analiza ni vende ningún dato de nadie.";
const COOKIE_NOTICE_IMAGE_SRCSET =
  "/assets/grumphya/cookie-kick-188.webp 188w, /assets/grumphya/cookie-kick-376.webp 376w, /assets/grumphya/cookie-kick.webp 570w";
const COOKIE_NOTICE_IMAGE_FALLBACK = "/assets/grumphya/cookie-kick-188.webp";

describe("CookieNotice", () => {
  beforeEach(() => {
    window.localStorage.removeItem(NOTICE_ACKNOWLEDGED_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the concise cookie notice and links to the full policy", () => {
    render(<CookieNotice />);

    expect(
      screen.getByRole("dialog", { name: "Ni galletitas ni galletitos" }),
    ).toBeInTheDocument();
    expect(screen.getByText(ABSTRACT_COOKIE_NOTICE_COPY)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: PRIVACY_LINK_NAME }),
    ).toHaveAttribute("href", "/politica-de-privacidad");
    expect(screen.getByRole("link", { name: PRIVACY_LINK_NAME })).toHaveClass(
      "cookie-notice-details",
    );
    const mascot = screen.getByRole("img", {
      name: "Grumphya le da una patada a una galleta",
    });
    expect(mascot).toBeInTheDocument();
    expect(mascot).toHaveAttribute("src", COOKIE_NOTICE_IMAGE_FALLBACK);
    expect(mascot).toHaveAttribute("srcset", COOKIE_NOTICE_IMAGE_SRCSET);
    expect(mascot).toHaveAttribute("sizes", "(max-width: 480px) 188px, 225px");
    expect(mascot).toHaveAttribute("width", "285");
    expect(mascot).toHaveAttribute("height", "190");
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
