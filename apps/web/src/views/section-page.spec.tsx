import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionPage } from "./section-page";

describe("SectionPage", () => {
  it("loads the selected feature without rendering other section content", async () => {
    render(<SectionPage path="/precios" />);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Iluminado" }),
    ).toBeVisible();
    expect(
      screen.queryByText(/quiero una app que haga mi trabajo mientras duermo/i),
    ).not.toBeInTheDocument();
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
