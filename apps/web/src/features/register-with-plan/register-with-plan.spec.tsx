import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterWithPlan } from "./register-with-plan";

const PLAN_RESPONSE = { plan: "ILUMINADO" };
const REGISTRATION_RESPONSE = { status: "verification_pending" };
const VALID_EMAIL = "persona@example.es";
const VALID_USERNAME = "persona-lista";
const VALID_PASSWORD = "Una contraseña suficientemente segura 48!";
const REGISTER_SUBMIT_BUTTON_NAME = /crear cuenta y verificar correo/i;
const PASSWORD_REQUIREMENTS =
  "Mínimo 12 caracteres, con mayúscula, minúscula, número y carácter especial.";
const TERMS_PATH = "/terminos-y-condiciones";

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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
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
    expect(
      screen.getByRole("link", { name: /términos y condiciones/i }),
    ).toHaveAttribute("href", TERMS_PATH);
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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
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

  it("shows the current registration copy and orders password guidance after the field", async () => {
    render(<RegisterWithPlan />);

    expect(
      await screen.findByRole("heading", {
        name: "Vamos a ponerle nombre a la cuenta",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Un mes. Sin renovaciones automáticas.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no tendrás que cancelar nada/i),
    ).toBeInTheDocument();

    const password = screen.getByLabelText(/contraseña/i);
    const help = screen.getByText(PASSWORD_REQUIREMENTS);
    const passwordField = password.closest(".registration-field");
    expect(password).toHaveAttribute(
      "aria-describedby",
      "registration-password-help",
    );
    expect(passwordField).not.toBeNull();
    if (!passwordField) throw new Error("Password field wrapper is missing.");
    const fieldElements = Array.from(passwordField.children);
    expect(fieldElements.indexOf(password)).toBeLessThan(
      fieldElements.indexOf(help),
    );
  });

  it("posts the registration and asks the user to check email without starting a session", async () => {
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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
    );

    expect(
      await screen.findByRole("heading", { name: /revisa tu correo/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /no se activa la cuenta ni el plan/i,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/auth/refresh",
      expect.anything(),
    );
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
      name: REGISTER_SUBMIT_BUTTON_NAME,
    });
    await user.click(submitButton);
    expect(
      await screen.findByRole("button", { name: /dándote de alta/i }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /dándote de alta/i }));
    expect(fetch).toHaveBeenCalledTimes(2);

    finishRegistration?.(jsonResponse(REGISTRATION_RESPONSE, 201));
    expect(
      await screen.findByRole("heading", { name: /revisa tu correo/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /crear cuenta|dándote de alta/i }),
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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /vuelve a cargar la página/i,
    );
    expect(
      screen.getByRole("button", { name: /alta enviada/i }),
    ).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows the generic check-email state for duplicate registration details", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input) === "/api/registration-intents/current"
        ? jsonResponse(PLAN_RESPONSE)
        : jsonResponse(REGISTRATION_RESPONSE, 201),
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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
    );

    expect(
      await screen.findByRole("heading", { name: /revisa tu correo/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/correo ya existe|nombre de usuario ya existe/i),
    ).not.toBeInTheDocument();
  });

  it("requests a resend through a generic response", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input) === "/api/registration-intents/current")
        return jsonResponse(PLAN_RESPONSE);
      if (String(input) === "/api/registrations/resend-verification")
        return jsonResponse(REGISTRATION_RESPONSE);
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
      screen.getByRole("button", { name: REGISTER_SUBMIT_BUTTON_NAME }),
    );
    await user.click(
      await screen.findByRole("button", { name: /solicitar otro enlace/i }),
    );
    expect(
      await screen.findByText(/si hay una verificación pendiente/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/registrations/resend-verification",
      expect.objectContaining({ body: JSON.stringify({ email: VALID_EMAIL }) }),
    );
  });
});
