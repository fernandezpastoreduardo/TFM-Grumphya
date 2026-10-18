import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Roast } from "./roast";

const mocks = vi.hoisted(() => ({
  session: {
    isAuthenticated: false as boolean | null,
    accountAttempts: null as {
      ideas: number;
      roasts: number;
      ideasPlanActive: boolean;
      roastsPlanActive: boolean;
    } | null,
  },
  usage: {
    usage: {
      ideas: { limit: 3 as const, used: 0, remaining: 3 },
      roasts: { limit: 3 as const, used: 0, remaining: 3 },
    } as {
      ideas: { limit: 3; used: number; remaining: number };
      roasts: { limit: 3; used: number; remaining: number };
    } | null,
    refresh: vi.fn(),
  },
}));

vi.mock("../../infrastructure/auth/use-session-status", () => ({
  useSessionStatus: () => mocks.session,
}));
vi.mock("../../shared/hooks/use-anonymous-usage", () => ({
  useAnonymousUsage: () => mocks.usage,
}));
vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
  getAccessToken: vi.fn(async () => null),
}));

describe("Roast", () => {
  beforeEach(() => {
    mocks.session.isAuthenticated = false;
    mocks.session.accountAttempts = null;
    mocks.usage.usage = {
      ideas: { limit: 3, used: 0, remaining: 3 },
      roasts: { limit: 3, used: 0, remaining: 3 },
    };
  });

  it("shows the Faltón daily quota for a signed-in user", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: 0,
      roasts: 8,
      ideasPlanActive: false,
      roastsPlanActive: true,
    };

    render(<Roast />);

    expect(
      screen.getByLabelText("8 de 11 envíos disponibles hoy"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /tu insulto/i })).toBeEnabled();
  });

  it("disables roast submission when the signed-in user's daily quota is empty", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: 11,
      roasts: 0,
      ideasPlanActive: true,
      roastsPlanActive: true,
    };

    render(<Roast />);

    expect(
      screen.getByLabelText("0 de 11 envíos disponibles hoy"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /tu insulto/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /enviar insulto/i })).toBeDisabled();
  });

  it("keeps three free roasts for an authenticated user with only Iluminado", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: 7,
      roasts: 0,
      ideasPlanActive: true,
      roastsPlanActive: false,
    };

    render(<Roast />);

    expect(
      screen.getByLabelText("3 de 3 envíos gratuitos restantes"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /tu insulto/i })).toBeEnabled();
  });

  it("keeps the independent lifetime quota for anonymous roast users", () => {
    mocks.session.isAuthenticated = false;
    mocks.usage.usage = {
      ideas: { limit: 3, used: 0, remaining: 3 },
      roasts: { limit: 3, used: 2, remaining: 1 },
    };

    render(<Roast />);

    expect(
      screen.getByLabelText("1 de 3 envíos gratuitos restantes"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /tu insulto/i })).toBeEnabled();
  });

  it("clarifies that only the opening exchanges are examples", () => {
    render(<Roast />);

    expect(
      screen.getByText(
        /los intercambios iniciales son ejemplos\. tus mensajes reciben la respuesta configurada en el servidor/i,
      ),
    ).toBeInTheDocument();
  });
});
