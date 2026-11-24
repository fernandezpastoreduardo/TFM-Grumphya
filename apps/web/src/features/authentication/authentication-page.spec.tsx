import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccessToken,
  getAccessToken,
} from "../../infrastructure/auth/session";
import { AuthenticationPage } from "./authentication-page";
import * as abuseChallenge from "../../shared/utils/abuse-challenge";

const LOGIN_ENDPOINT = "/api/auth/login";
const IDENTIFIER = "persona-lista";
const PASSWORD = "Una contraseña suficientemente segura 48!";
const ACCESS_TOKEN = "jwt-access-token-from-test";
const USER_LOGIN_RESPONSE = {
  accessToken: ACCESS_TOKEN,
  account: { user: { role: "user" } },
};
const ADMIN_LOGIN_RESPONSE = {
  accessToken: ACCESS_TOKEN,
  account: { user: { role: "admin" } },
};
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (LOCATION_DESCRIPTOR)
      Object.defineProperty(window, "location", LOCATION_DESCRIPTOR);
  });

  it("uses Grumphya copy and aligns the privacy panel with the form", () => {
    const { container } = render(<AuthenticationPage />);

    expect(
      screen.getByRole("heading", {
        name: "¿Vienes a por más? Estupendo, tengo servidores para eso y más.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tu historial no es público." }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".authentication-layout"),
    ).toBeInTheDocument();
  });

  it("reveals the password with an accessible keyboard-operable control", async () => {
    const user = userEvent.setup();
    render(<AuthenticationPage />);

    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");
    await user.type(password, PASSWORD);

    await user.tab();

    const revealButton = screen.getByRole("button", {
      name: "Mostrar contraseña",
    });
    expect(revealButton).toHaveAttribute("aria-controls", "login-password");
    await user.keyboard("{Enter}");

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue(PASSWORD);
    expect(
      screen.getByRole("button", { name: "Ocultar contraseña" }),
    ).toHaveAttribute("aria-controls", "login-password");
    await user.keyboard("{Enter}");
    expect(password).toHaveAttribute("type", "password");
  });

  it("submits credentials and opens the profile for regular users", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(USER_LOGIN_RESPONSE)),
    );
    render(<AuthenticationPage />);
    expect(
      screen.getByRole("link", { name: /he olvidado la contraseña/i }),
    ).toHaveAttribute("href", "/recuperar-contrasena");

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

  it("opens the admin control panel after an admin signs in", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(ADMIN_LOGIN_RESPONSE)),
    );
    render(<AuthenticationPage />);

    await user.type(screen.getByLabelText(/usuario o correo/i), "jappy");
    await user.type(screen.getByLabelText("Contraseña"), PASSWORD);
    await user.click(screen.getByRole("button", { name: /^entrar/i }));

    expect(assign).toHaveBeenCalledWith("/panel-control");
  });

  it("solves and retries login when the server activates browser challenge mode", async () => {
    const user = userEvent.setup();
    const challenge = { token: "signed-challenge", difficulty: 16 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "LOGIN_CHALLENGE_REQUIRED",
            challenge,
          },
          428,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(USER_LOGIN_RESPONSE));
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.spyOn(abuseChallenge, "solveAbuseChallenge").mockResolvedValue("1234");
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthenticationPage />);

    await user.type(screen.getByLabelText(/usuario o correo/i), IDENTIFIER);
    await user.type(screen.getByLabelText("Contraseña"), PASSWORD);
    await user.click(screen.getByRole("button", { name: /^entrar/i }));

    expect(abuseChallenge.solveAbuseChallenge).toHaveBeenCalledWith(challenge);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      LOGIN_ENDPOINT,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Abuse-Challenge": challenge.token,
          "X-Abuse-Proof": "1234",
        },
      }),
    );
    expect(assign).toHaveBeenCalledWith("/perfil");
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
