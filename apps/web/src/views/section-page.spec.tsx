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
});
