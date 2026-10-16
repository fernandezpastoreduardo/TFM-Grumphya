import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterWithPlan } from "./register-with-plan";

const PLAN_RESPONSE = { plan: "ILUMINADO" };
const REGISTRATION_RESPONSE = {
  status: "active",
  plan: "ILUMINADO",
  account: {},
  accessToken: "test-only-access-token",
  expiresIn: 600,
};
const VALID_EMAIL = "persona@example.es";
const VALID_USERNAME = "persona-lista";
const VALID_PASSWORD = "Una contraseña suficientemente segura 48!";
const DUPLICATE_RESPONSE = {
  message:
    "No se ha podido confirmar el alta. Para evitar un envío duplicado, vuelve a cargar la página antes de intentarlo otra vez.",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RegisterWithPlan", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(PLAN_RESPONSE)),
    );
    window.history.replaceState({}, "", "/crear-cuenta?plan=falton");
  });

  it("loads the selected plan from the server and never from the URL", async () => {
    render(<RegisterWithPlan />);

    expect(
      await screen.findByText(/plan seleccionado: iluminado/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/registration-intents/current",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(
      screen.queryByText(/plan seleccionado: faltón/i),
    ).not.toBeInTheDocument();
  });

  it("validates email syntax, username, password and privacy acknowledgement before posting", async () => {
    const user = userEvent.setup();
    render(<RegisterWithPlan />);

    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      "esto-no-es",
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(screen.getByLabelText(/contraseña/i), VALID_PASSWORD);
    await user.click(
      screen.getByRole("button", { name: /dáme de alta y te pago un café/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Venga ya, ese correo no es de verdad, escribe bien anda.",
    );
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute(
      "aria-describedby",
      "registration-error",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a password that lacks the required character groups before posting", async () => {
    const user = userEvent.setup();
    render(<RegisterWithPlan />);

    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      VALID_EMAIL,
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(
      screen.getByLabelText(/contraseña/i),
      "una clave larga 2026!",
    );
    await user.click(screen.getByRole("checkbox", { name: /he leído/i }));
    await user.click(
      screen.getByRole("button", { name: /dáme de alta y te pago un café/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Usa al menos 12 caracteres e incluye mayúscula, minúscula, número y carácter especial.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires the privacy acknowledgement and links to the privacy policy", async () => {
    const user = userEvent.setup();
    render(<RegisterWithPlan />);

    expect(
      await screen.findByRole("link", { name: /política de privacidad/i }),
    ).toHaveAttribute("href", "/politica-de-privacidad");
    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      VALID_EMAIL,
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(screen.getByLabelText(/contraseña/i), VALID_PASSWORD);
    await user.click(
      screen.getByRole("button", { name: /dáme de alta y te pago un café/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /debes confirmar que has leído la política de privacidad/i,
    );
    expect(screen.getByRole("checkbox", { name: /he leído/i })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: /he leído/i })).toHaveAttribute(
      "aria-describedby",
      "registration-error",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("posts the registration and opens the simulated payment dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/registration-intents/current") {
        return jsonResponse(PLAN_RESPONSE);
      }
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        email: VALID_EMAIL,
        username: VALID_USERNAME,
        password: VALID_PASSWORD,
        privacyPolicyAcknowledged: true,
      });
      return jsonResponse(REGISTRATION_RESPONSE, 201);
    });
    render(<RegisterWithPlan />);

    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      VALID_EMAIL,
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(screen.getByLabelText(/contraseña/i), VALID_PASSWORD);
    await user.click(screen.getByRole("checkbox", { name: /he leído/i }));
    await user.click(
      screen.getByRole("button", { name: /dáme de alta y te pago un café/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /un momento\. estoy preparando tu cuenta/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "el pago es simulado y no se te cobrará nada",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("locks the submit button during the request and prevents another POST after acceptance", async () => {
    const user = userEvent.setup();
    let finishRegistration: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input) === "/api/registration-intents/current")
        return Promise.resolve(jsonResponse(PLAN_RESPONSE));
      return new Promise((resolve) => {
        finishRegistration = resolve;
      });
    });
    render(<RegisterWithPlan />);

    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      VALID_EMAIL,
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(screen.getByLabelText(/contraseña/i), VALID_PASSWORD);
    await user.click(screen.getByRole("checkbox", { name: /he leído/i }));
    const submitButton = screen.getByRole("button", {
      name: /dáme de alta y te pago un café/i,
    });
    await user.click(submitButton);
    expect(
      await screen.findByRole("button", { name: /dándote de alta/i }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /dándote de alta/i }));
    expect(fetch).toHaveBeenCalledTimes(2);

    finishRegistration?.(jsonResponse(REGISTRATION_RESPONSE, 201));
    expect(
      await screen.findByRole("heading", {
        name: /un momento\. estoy preparando tu cuenta/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dáme de alta|dándote de alta/i }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the submit locked after an ambiguous failure to avoid duplicating the request", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input) === "/api/registration-intents/current"
        ? jsonResponse(PLAN_RESPONSE)
        : jsonResponse({}, 503),
    );
    render(<RegisterWithPlan />);

    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      VALID_EMAIL,
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(screen.getByLabelText(/contraseña/i), VALID_PASSWORD);
    await user.click(screen.getByRole("checkbox", { name: /he leído/i }));
    await user.click(
      screen.getByRole("button", { name: /dáme de alta y te pago un café/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /vuelve a cargar la página/i,
    );
    expect(
      screen.getByRole("button", { name: /alta enviada/i }),
    ).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows the same vague response for registration conflicts", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input) === "/api/registration-intents/current"
        ? jsonResponse(PLAN_RESPONSE)
        : jsonResponse(DUPLICATE_RESPONSE, 409),
    );
    render(<RegisterWithPlan />);

    await user.type(
      await screen.findByLabelText(/correo electrónico/i),
      VALID_EMAIL,
    );
    await user.type(
      screen.getByLabelText(/nombre de usuario/i),
      VALID_USERNAME,
    );
    await user.type(screen.getByLabelText(/contraseña/i), VALID_PASSWORD);
    await user.click(screen.getByRole("checkbox", { name: /he leído/i }));
    await user.click(
      screen.getByRole("button", { name: /dáme de alta y te pago un café/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      DUPLICATE_RESPONSE.message,
    );
    expect(
      screen.queryByText(/correo ya existe|nombre de usuario ya existe/i),
    ).not.toBeInTheDocument();
  });
});
