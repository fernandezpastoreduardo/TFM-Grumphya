import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SectionPage } from "./section-page";

describe("SectionPage", () => {
  beforeEach(() => localStorage.clear());

  it("restores the selected theme after opening another section", () => {
    localStorage.setItem("grumphya-theme", "dark");
    const { container } = render(<SectionPage path="/precios" />);

    expect(container.querySelector(".app-page")).toHaveClass("theme-dark");
    expect(
      screen.getByRole("switch", { name: /activar modo claro/i }),
    ).toBeVisible();
  });

  it("loads the selected feature without rendering other section content", async () => {
    render(<SectionPage path="/precios" />);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Iluminado" }),
    ).toBeVisible();
    expect(
      screen.queryByText(/quiero una app que haga mi trabajo mientras duermo/i),
    ).not.toBeInTheDocument();
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
});
