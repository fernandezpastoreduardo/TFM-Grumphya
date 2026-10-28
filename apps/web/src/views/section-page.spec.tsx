import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionPage } from "./section-page";
import {
  clearAccessToken,
  setAccessToken,
} from "../infrastructure/auth/session";
import { ACCREDITATION_VERIFICATION_URL } from "../shared/accreditation-verification";

describe("SectionPage", () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
  });

  it("adds the control panel to the section menu for an admin", async () => {
    setAccessToken("test-admin-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/account/profile") {
          return new Response(
            JSON.stringify({ user: { role: "admin" }, plans: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 503 });
      }),
    );

    render(<SectionPage path="/precios" />);

    const navigation = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    expect(
      await within(navigation).findByRole("link", {
        name: "Panel de control",
      }),
    ).toHaveAttribute("href", "/panel-control");
  });

  it("restores the selected theme after opening another section", () => {
    localStorage.setItem("grumphya-theme", "dark");
    const { container } = render(<SectionPage path="/precios" />);

    expect(container.querySelector(".app-page")).toHaveClass("theme-dark");
    expect(
      screen.getByRole("switch", { name: /activar modo claro/i }),
    ).toBeVisible();
  });

  it("shows current, neutral account copy without claiming email is unverified", async () => {
    render(<SectionPage path="/perfil" />);

    expect(
      await screen.findByText(
        "Aquí tienes tus planes, tu actividad y los datos de tu cuenta.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/el correo todavía está pendiente de verificación/i),
    ).not.toBeInTheDocument();
  });

  it("loads the selected feature without rendering other section content", async () => {
    const { container } = render(<SectionPage path="/precios" />);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Iluminado" }),
    ).toBeVisible();
    expect(
      screen.queryByText(/quiero una app que haga mi trabajo mientras duermo/i),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/¿en serio\?/i);
  });

  it("routes the terms page and presents the idea processing notice there", async () => {
    render(<SectionPage path="/terminos-y-condiciones" />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Términos y condiciones",
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Tratamiento de las ideas y los dictados",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/no guardamos el texto original/i),
    ).toBeInTheDocument();
  });

  it("routes the current privacy policy and presents its scope", async () => {
    render(<SectionPage path="/politica-de-privacidad" />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Política de privacidad",
      }),
    ).toBeVisible();
    const policy = await screen.findByRole("article", {
      name: "Política de privacidad",
    });
    expect(within(policy).queryByText(/borrador/i)).not.toBeInTheDocument();
    expect(
      within(policy).getByText(/Avenida de América 46, 4.º A/i),
    ).toBeInTheDocument();
    expect(
      within(policy).getByRole("heading", {
        name: /cuánto tiempo se conservan/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(policy).getByRole("heading", {
        name: /cookies y almacenamiento local/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows the 404 page for an unknown path", () => {
    render(<SectionPage path="/no-existe" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "404" }),
    ).toBeVisible();
    expect(screen.getByText("Por aquí no hay ninguna sección.")).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "Primero el problema. Luego el código.",
      }),
    ).not.toBeInTheDocument();
  });

  it("links to the public verification from the section footer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          Response.json({
            id: "DS-GRUMPHYA-2026-001",
            issuer: "Desarrollo Seguro",
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
            disclaimer: "Sin certificación oficial.",
          }),
        ),
      ),
    );
    render(<SectionPage path="/precios" />);

    const seal = screen
      .getByRole("contentinfo")
      .querySelector("a[href^='/acreditaciones/']");
    expect(seal).toHaveAccessibleName(
      /verificar demostración de desarrollo seguro/i,
    );
    expect(
      await screen.findByAltText("Sello ilustrado de Desarrollo Seguro"),
    ).toHaveAttribute("src", "/assets/desarrollo-seguro/sello-s4.webp");
    expect(seal).toHaveTextContent("Demostración académica");
  });

  it("opens the public verification and rejects an unknown accreditation route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          Response.json({
            id: "DS-GRUMPHYA-2026-001",
            issuer: "Desarrollo Seguro",
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
          }),
        ),
      ),
    );
    const { unmount } = render(
      <SectionPage path={ACCREDITATION_VERIFICATION_URL} />,
    );

    expect(
      await screen.findByRole("article", { name: /ficha de verificación/i }),
    ).toBeVisible();
    unmount();
    render(<SectionPage path="/acreditaciones/DS-NO-EXISTE" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "404" }),
    ).toBeVisible();
  });
});
