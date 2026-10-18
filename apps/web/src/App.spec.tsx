import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  clearAccessToken,
  setAccessToken,
} from "./infrastructure/auth/session";

const LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, "location");

afterEach(() => {
  vi.unstubAllGlobals();
  clearAccessToken();
  window.history.replaceState({}, "", "/");
  if (LOCATION_DESCRIPTOR)
    Object.defineProperty(window, "location", LOCATION_DESCRIPTOR);
});

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
  });

  it("redirects an authenticated visitor away from create-account to their profile", async () => {
    window.history.pushState({}, "", "/crear-cuenta");
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace },
    });
    setAccessToken("test-access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    render(<App />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/perfil"));
    expect(
      screen.queryByRole("heading", { name: /vamos a ponerle nombre/i }),
    ).not.toBeInTheDocument();
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
