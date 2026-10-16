import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("loads the idea input and project purpose for the home route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: /antes de construirla.*mira dónde puede romperse/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /grumphya, inicio/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /qué aplicación/i }),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows a 404 page for an unknown browser path", async () => {
    window.history.pushState({}, "", "/ruta-que-no-existe");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeVisible();
    expect(screen.getByText("Por aquí no hay ninguna sección.")).toBeVisible();
    window.history.pushState({}, "", "/");
  });

  it.each(["404", "429", "500"] as const)(
    "exposes the %s error preview only from the development route",
    async (status) => {
      window.history.pushState({}, "", `/__preview/errors/${status}`);

      render(<App />);

      expect(
        await screen.findByRole("heading", { level: 1, name: status }),
      ).toBeVisible();
      window.history.pushState({}, "", "/");
    },
  );
});
