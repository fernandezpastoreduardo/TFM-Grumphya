import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccreditationVerification } from "../../features/accreditation-verification/accreditation-verification";
import {
  isSealDisplayAllowed,
  type AccreditationRecord,
} from "../accreditation-verification";
import { AccreditationSeal } from "./accreditation-seal";

const RECORD: AccreditationRecord = {
  id: "DS-GRUMPHYA-2026-001",
  issuer: "Grumphya · revisión interna",
  application: "Grumphya",
  authorizedDomains: ["grumphya.com"],
  status: "demonstration",
  issuedAt: null,
  validatedAt: null,
  validationMethod: "No indicada",
  expiresAt: null,
  assurances: [],
  scope: "Prototipo académico",
  criteria: [],
  disclaimer: "Sin certificación oficial ni auditoría independiente.",
};

afterEach(() => vi.unstubAllGlobals());

describe("AccreditationSeal", () => {
  it("checks the displayed site's exact hostname in production", () => {
    expect(isSealDisplayAllowed(RECORD, "grumphya.com", false)).toBe(true);
    expect(isSealDisplayAllowed(RECORD, "evil.example", false)).toBe(false);
    expect(
      isSealDisplayAllowed(RECORD, "grumphya.com.evil.example", false),
    ).toBe(false);
    expect(isSealDisplayAllowed(RECORD, "localhost", false)).toBe(false);
    expect(isSealDisplayAllowed(RECORD, "localhost", true)).toBe(true);
    expect(isSealDisplayAllowed(RECORD, "127.0.0.1", true)).toBe(true);
    expect(isSealDisplayAllowed(RECORD, "evil.example", true)).toBe(false);
  });

  it("does not show the neutral icon until the server confirms the demonstration", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);

    render(<AccreditationSeal />);

    const link = screen.getByRole("link", {
      name: /consultando el estado del sello.*conocer la propuesta/i,
    });
    expect(link).toHaveAttribute("href", "https://desarrolloseguro.org/");
    expect(link).toHaveTextContent("Consultando el estado del sello");
    expect(
      document.querySelector(".accreditation-seal img"),
    ).not.toBeInTheDocument();

    resolveResponse?.(Response.json(RECORD));

    expect(
      await screen.findByText(
        /Demostración académica · Sin certificación oficial/i,
      ),
    ).toBeVisible();
    expect(document.querySelector(".accreditation-seal img")).toHaveAttribute(
      "src",
      "/assets/desarrolloseguro.org/icon.svg",
    );
    expect(link).toHaveTextContent("Sin certificación oficial");
    expect(link).toHaveAccessibleName(
      /desarrolloseguro\.org.*demostración académica.*sin certificación oficial.*conocer la propuesta/i,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accreditations/DS-GRUMPHYA-2026-001",
      { credentials: "omit", cache: "no-store" },
    );
  });

  it.each(["suspended", "revoked", "expired", "unknown"])(
    "removes the neutral icon for %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ ...RECORD, status })),
      );

      render(<AccreditationSeal />);

      expect(
        await screen.findByText(/sello no verificable o sin vigencia/i),
      ).toBeVisible();
      expect(
        document.querySelector(".accreditation-seal img"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://desarrolloseguro.org/",
      );
    },
  );

  it("rechecks the server after remount and hides a revoked seal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(RECORD))
      .mockResolvedValueOnce(Response.json({ ...RECORD, status: "revoked" }));
    vi.stubGlobal("fetch", fetchMock);

    const firstView = render(<AccreditationSeal />);
    expect(
      await screen.findByText(
        /Demostración académica · Sin certificación oficial/i,
      ),
    ).toBeVisible();
    firstView.unmount();

    render(<AccreditationSeal />);
    expect(
      await screen.findByText(/sello no verificable o sin vigencia/i),
    ).toBeVisible();
    expect(
      document.querySelector(".accreditation-seal img"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not show the icon for an unauthorized domain", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...RECORD, authorizedDomains: ["evil.example"] }),
        ),
    );

    render(<AccreditationSeal />);

    expect(
      await screen.findByText(/sello no verificable o sin vigencia/i),
    ).toBeVisible();
    expect(
      document.querySelector(".accreditation-seal img"),
    ).not.toBeInTheDocument();
  });

  it("keeps only the accessible text link when verification fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<AccreditationSeal />);

    expect(
      await screen.findByText(/sello no verificable o sin vigencia/i),
    ).toBeVisible();
    expect(
      document.querySelector(".accreditation-seal img"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAccessibleName(
      /sello no verificable o sin vigencia.*conocer la propuesta/i,
    );
  });

  it("shares a simultaneous lookup with the verification page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(RECORD));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <AccreditationSeal />
        <AccreditationVerification />
      </>,
    );

    expect(
      await screen.findByRole("article", {
        name: "Ficha de revisión interna de Grumphya",
      }),
    ).toBeVisible();
    expect(
      await screen.findByText(
        /Demostración académica · Sin certificación oficial/i,
      ),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
