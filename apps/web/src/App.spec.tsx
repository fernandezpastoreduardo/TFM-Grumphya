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
});
