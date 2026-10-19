import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Contact } from "./contact";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { authenticatedFetch } from "../../infrastructure/auth/session";

vi.mock("../../infrastructure/auth/use-session-status", () => ({
  useSessionStatus: vi.fn(),
}));

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
}));

const mockedUseSessionStatus = vi.mocked(useSessionStatus);
const mockedAuthenticatedFetch = vi.mocked(authenticatedFetch);

beforeEach(() => {
  mockedUseSessionStatus.mockReturnValue({
    isAuthenticated: true,
    accountAttempts: null,
    avatarUrl: null,
    isSigningOut: false,
    signOut: vi.fn(),
  });
});

afterEach(() => {
  mockedUseSessionStatus.mockReset();
  mockedAuthenticatedFetch.mockReset();
});

describe("Contact", () => {
  it("shows an authenticated contact form instead of the anonymous joke", () => {
    render(<Contact />);

    expect(
      screen.getByRole("heading", { name: /cuéntanos qué necesitas/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/a nadie le importa lo que tengas que decir/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /asunto/i })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /mensaje/i })).toBeVisible();
    expect(
      screen.getByText(/mensaje queda guardado junto a tu cuenta/i),
    ).toBeVisible();
    expect(
      screen.getByText(/plazo de borrado definido ni un canal de respuesta/i),
    ).toBeVisible();
  });

  it("submits the authenticated user's message and confirms it was received", async () => {
    const user = userEvent.setup();
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response(null, { status: 201 }),
    );
    render(<Contact />);

    await user.type(
      screen.getByRole("textbox", { name: /asunto/i }),
      "Consulta sobre mi cuenta",
    );
    await user.type(
      screen.getByRole("textbox", { name: /mensaje/i }),
      "Necesito ayuda para entender el estado de mi plan.",
    );
    await user.click(screen.getByRole("button", { name: /enviar mensaje/i }));

    expect(mockedAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/contact-messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          subject: "Consulta sobre mi cuenta",
          message: "Necesito ayuda para entender el estado de mi plan.",
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /mensaje registrado/i,
    );
  });

  it("shows a useful error and keeps the message when submission fails", async () => {
    const user = userEvent.setup();
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    render(<Contact />);

    await user.type(
      screen.getByRole("textbox", { name: /asunto/i }),
      "Consulta de mi cuenta",
    );
    const message = screen.getByRole("textbox", { name: /mensaje/i });
    await user.type(
      message,
      "Necesito ayuda para entender el estado de mi plan.",
    );
    await user.click(screen.getByRole("button", { name: /enviar mensaje/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido registrar/i,
    );
    expect(message).toHaveValue(
      "Necesito ayuda para entender el estado de mi plan.",
    );
  });

  it("disables repeated submission while the message is being saved", async () => {
    const user = userEvent.setup();
    let resolveResponse: ((response: Response) => void) | undefined;
    mockedAuthenticatedFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    render(<Contact />);

    await user.type(
      screen.getByRole("textbox", { name: /asunto/i }),
      "Consulta de cuenta",
    );
    await user.type(
      screen.getByRole("textbox", { name: /mensaje/i }),
      "Necesito ayuda para entender el estado de mi plan.",
    );
    const submitButton = screen.getByRole("button", {
      name: /enviar mensaje/i,
    });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(mockedAuthenticatedFetch).toHaveBeenCalledTimes(1);

    resolveResponse?.(new Response(null, { status: 201 }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /mensaje registrado/i,
    );
  });

  it("keeps the demonstration form for signed-out visitors", () => {
    mockedUseSessionStatus.mockReturnValue({
      isAuthenticated: false,
      accountAttempts: null,
      avatarUrl: null,
      isSigningOut: false,
      signOut: vi.fn(),
    });
    render(<Contact />);

    expect(
      screen.getByText(/escribe lo que nadie te ha pedido/i),
    ).toBeVisible();
    expect(screen.getByText(/vista de demostración/i)).toBeVisible();
  });
});
