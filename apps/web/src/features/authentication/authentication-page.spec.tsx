import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccessToken,
  getAccessToken,
} from "../../infrastructure/auth/session";
import { AuthenticationPage } from "./authentication-page";

const LOGIN_ENDPOINT = "/api/auth/login";
const IDENTIFIER = "persona-lista";
const PASSWORD = "Una contraseña suficientemente segura 48!";
const ACCESS_TOKEN = "jwt-access-token-from-test";
const GENERIC_LOGIN_ERROR =
  "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.";
const LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, "location");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AuthenticationPage", () => {
  beforeEach(() => {
    clearAccessToken();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
    if (LOCATION_DESCRIPTOR)
      Object.defineProperty(window, "location", LOCATION_DESCRIPTOR);
  });

  it("submits credentials and remember-me, keeps the token in memory and opens the profile", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ accessToken: ACCESS_TOKEN })),
    );
    render(<AuthenticationPage />);

    await user.type(screen.getByLabelText(/usuario o correo/i), IDENTIFIER);
    await user.type(screen.getByLabelText("Contraseña"), PASSWORD);
    await user.click(
      screen.getByRole("checkbox", { name: /recordarme en este dispositivo/i }),
    );
    await user.click(screen.getByRole("button", { name: /^entrar/i }));

    expect(fetch).toHaveBeenCalledWith(
      LOGIN_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: IDENTIFIER,
          password: PASSWORD,
          rememberMe: true,
        }),
      }),
    );
    await expect(getAccessToken()).resolves.toBe(ACCESS_TOKEN);
    expect(assign).toHaveBeenCalledWith("/perfil");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("shows a generic error and does not store a token when login is rejected", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    render(<AuthenticationPage />);

    await user.type(screen.getByLabelText(/usuario o correo/i), IDENTIFIER);
    await user.type(screen.getByLabelText("Contraseña"), PASSWORD);
    await user.click(screen.getByRole("button", { name: /^entrar/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      GENERIC_LOGIN_ERROR,
    );
    await expect(getAccessToken()).resolves.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the same generic error if the login request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<AuthenticationPage />);

    await user.type(screen.getByLabelText(/usuario o correo/i), IDENTIFIER);
    await user.type(screen.getByLabelText("Contraseña"), PASSWORD);
    await user.click(screen.getByRole("button", { name: /^entrar/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      GENERIC_LOGIN_ERROR,
    );
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
