import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPolicy } from "./privacy-policy";

const PRIVACY_EMAIL = "contacto@grumphya.com";

describe("PrivacyPolicy", () => {
  it("presents the draft and marks it as not ready for publication", () => {
    render(<PrivacyPolicy />);

    expect(
      screen.getByRole("heading", { name: /política de privacidad/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/borrador pendiente de validación/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/borrador, no publicar todavía/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /uso de inteligencia artificial/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /tus derechos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Eduardo Fernández Pastor/i)).toBeInTheDocument();
    expect(screen.getByText(/domicilio postal/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no ha fijado una edad mínima/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nunca muestra el autor ni el texto original/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/las ideas aprobadas no se publican/i),
    ).toBeInTheDocument();
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
