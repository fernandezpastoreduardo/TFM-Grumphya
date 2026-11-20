import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccreditationSeal } from "./accreditation-seal";

const BADGE_TOKEN = "oKRH-ZltmA7YRYP2ttXFkIcOBPm4sGksI14GN8nPscc";
const BADGE_REPORT_ID = "6bff5c3e-ff99-4f68-bfe9-fb5f5dfb2823";
const BADGE_SCRIPT_URL =
  "https://desarrolloseguro.org/desarrollo-seguro/badge-widget.js";
const CSP_NONCE = "test-csp-nonce";

afterEach(() => {
  vi.unstubAllGlobals();
  document
    .querySelectorAll(`script[src="${BADGE_SCRIPT_URL}"]`)
    .forEach((script) => script.remove());
  document
    .querySelectorAll("script[nonce]")
    .forEach((script) => script.remove());
});

describe("AccreditationSeal", () => {
  it.each(["grumphya.com", "www.grumphya.com"])(
    "requests verification for the current hostname (%s)",
    (hostname) => {
      vi.stubGlobal("window", { location: { hostname } });
      render(<AccreditationSeal />);

      const badge = document.querySelector<HTMLAnchorElement>(
        "a[data-ds-verified-badge]",
      );
      expect(badge).toHaveAttribute("hidden");
      expect(badge).toHaveAttribute("data-token", BADGE_TOKEN);
      expect(badge).toHaveAttribute("data-hostname", hostname);
      expect(badge).toHaveAttribute("data-report-id", BADGE_REPORT_ID);
      expect(badge).toHaveTextContent("Comprobando sello…");
      expect(
        screen.queryByText(/Demostración académica/i),
      ).not.toBeInTheDocument();
    },
  );

  it("loads the widget with the page CSP nonce", () => {
    const nonceScript = document.createElement("script");
    nonceScript.nonce = CSP_NONCE;
    document.head.append(nonceScript);

    const { unmount } = render(<AccreditationSeal />);

    const widgetScript = document.querySelector<HTMLScriptElement>(
      `script[src="${BADGE_SCRIPT_URL}"]`,
    );
    expect(widgetScript).toHaveAttribute("src", BADGE_SCRIPT_URL);
    expect(widgetScript).toHaveProperty("defer", true);
    expect(widgetScript).toHaveProperty("nonce", CSP_NONCE);

    unmount();
    expect(widgetScript).not.toBeInTheDocument();
  });

  it("does not load an external script without a CSP nonce", () => {
    render(<AccreditationSeal />);

    expect(
      document.querySelector(`script[src="${BADGE_SCRIPT_URL}"]`),
    ).not.toBeInTheDocument();
  });
});
