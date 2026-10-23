import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPolicy } from "./privacy-policy";

const PRIVACY_EMAIL = "contacto@grumphya.com";

describe("PrivacyPolicy", () => {
  it("presents the current privacy policy and the responsible person's details", () => {
    render(<PrivacyPolicy />);

    expect(
      screen.getByRole("heading", { name: /política de privacidad/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Versión 2 · 23 de octubre de 2026/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/borrador/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /uso de inteligencia artificial/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /tus derechos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Eduardo Fernández Pastor/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Avenida de América 46, 4.º A, 50007 Zaragoza, España/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no establece una edad mínima/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nunca muestra el autor ni el texto original/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/las ideas aprobadas no se publican/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/perfil seudónimo del navegador/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /controles de datos de la api de openai/i,
      }),
    ).toHaveAttribute(
      "href",
      "https://developers.openai.com/api/docs/guides/your-data",
    );
    const privacyLinks = screen.getAllByRole("link", { name: PRIVACY_EMAIL });
    expect(privacyLinks).toHaveLength(2);
    privacyLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "mailto:" + PRIVACY_EMAIL);
    });
    expect(screen.getByRole("link", { name: "www.aepd.es" })).toHaveAttribute(
      "href",
      "https://www.aepd.es/",
    );
  });
});
