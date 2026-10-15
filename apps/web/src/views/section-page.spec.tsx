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
});
