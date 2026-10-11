import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("shows the idea input and project purpose", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /antes de construirla/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /qué aplicación/i }),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
