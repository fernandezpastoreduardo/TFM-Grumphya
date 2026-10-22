import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  clearAccessToken,
  setAccessToken,
} from "./infrastructure/auth/session";

const LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, "location");

function getAdminRouteResponse(path: string): unknown {
  if (path.includes("/api/account/profile"))
    return { user: { role: "admin" }, plans: [] };
  if (path.includes("contact-messages")) return { messages: [] };
  return {
    revenue: { weeklyEur: 0, totalEur: 0 },
    estimatedAiCost: {
      weeklyUsd: 0,
      totalUsd: 0,
      weeklyAveragePerAccountUsd: 0,
      totalAveragePerAccountUsd: 0,
      activeRegisteredAccountCount: 0,
      activeAdminAccountCount: 0,
      weeklyByActor: { registeredUsersUsd: 0, adminsUsd: 0, anonymousUsd: 0 },
      totalByActor: { registeredUsersUsd: 0, adminsUsd: 0, anonymousUsd: 0 },
      weeklyTrend: [],
      unpricedUsageEvents: 0,
    },
    errors: [],
  };
}

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
      screen.getByRole("textbox", { name: /escribe, pega o dicta tu idea/i }),
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
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { role: "user" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<App />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/perfil"));
    expect(
      screen.queryByRole("heading", { name: /vamos a ponerle nombre/i }),
    ).not.toBeInTheDocument();
  });

  it("redirects an authenticated admin away from login to the control panel", async () => {
    window.history.pushState({}, "", "/login");
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace },
    });
    setAccessToken("test-admin-access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { role: "admin" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<App />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/panel-control"));
  });

  it("does not allow a regular account to open the admin control panel", async () => {
    window.history.pushState({}, "", "/panel-control");
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace },
    });
    setAccessToken("test-user-access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { role: "user" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<App />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/perfil"));
  });

  it.each(["/perfil", "/panel-control"] as const)(
    "redirects signed-out visitors away from the protected %s route",
    async (path) => {
      window.history.pushState({}, "", path);
      const replace = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, replace },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("{}", {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      render(<App />);

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    },
  );

  it("opens the protected control panel when the session belongs to an admin", async () => {
    window.history.pushState({}, "", "/panel-control");
    setAccessToken("test-admin-access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const body = getAdminRouteResponse(String(input));
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Panel de control",
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Hola, Jappy." }),
    ).toBeVisible();
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
