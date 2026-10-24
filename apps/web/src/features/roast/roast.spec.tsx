import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Roast } from "./roast";

const ROAST_INPUT_LABEL = /tu insulto/i;
const SUBMIT_ROAST_LABEL = /enviar insulto/i;
const ROAST_PLAN_CALLOUT_HEADING = /te has quedado con ganas/i;
const FIRST_SAMPLE_ROAST =
  "Quiero una app que haga mi trabajo mientras duermo.";
const SUBMITTED_ROAST = "Una app que cobra por mis ideas";
const SERVER_ROAST_REPLY = "Respuesta del servidor.";

const mocks = vi.hoisted(() => ({
  session: {
    isAuthenticated: false as boolean | null,
    accountAttempts: null as {
      ideas: number;
      roasts: number;
      ideasPlanActive: boolean;
      roastsPlanActive: boolean;
      roastMessagesSent?: number;
      isAdmin?: boolean;
    } | null,
    refresh: vi.fn(async () => null),
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
  getRoastRanking: vi.fn(
    async () => [] as Array<{ username: string; roastMessagesSent: number }>,
  ),
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
vi.mock("./services/get-roast-ranking", () => ({
  getRoastRanking: mocks.getRoastRanking,
}));

describe("Roast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mocks.getRoastRanking.mockResolvedValue([]);
    mocks.session.isAuthenticated = false;
    mocks.session.accountAttempts = null;
    mocks.session.refresh.mockResolvedValue(null);
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
    expect(
      screen.getByRole("textbox", { name: ROAST_INPUT_LABEL }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: ROAST_PLAN_CALLOUT_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("shows unlimited roast access for the admin account", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: Number.POSITIVE_INFINITY,
      roasts: Number.POSITIVE_INFINITY,
      ideasPlanActive: true,
      roastsPlanActive: true,
      isAdmin: true,
    };
    render(<Roast />);
    expect(screen.getByLabelText("Envíos ilimitados")).toBeInTheDocument();
    expect(screen.getByText(/tienes envíos ilimitados/i)).toBeInTheDocument();
    expect(screen.queryByText(/de Infinity/i)).not.toBeInTheDocument();
  });

  it("waits for the signed-in account's plan before showing the callout", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = null;

    render(<Roast />);

    expect(
      screen.queryByRole("heading", { name: ROAST_PLAN_CALLOUT_HEADING }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("textbox", { name: ROAST_INPUT_LABEL }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: SUBMIT_ROAST_LABEL }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("heading", { name: ROAST_PLAN_CALLOUT_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("shows the shared daily quota dialog when Faltón rejects an exhausted roast", async () => {
    const user = userEvent.setup();
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: 0,
      roasts: 1,
      ideasPlanActive: false,
      roastsPlanActive: true,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "PLAN_QUOTA_EXHAUSTED",
              scope: "roasts",
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    render(<Roast />);

    await user.type(
      screen.getByRole("textbox", { name: ROAST_INPUT_LABEL }),
      SUBMITTED_ROAST,
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_ROAST_LABEL }));

    const quotaDialog = await screen.findByRole("dialog", {
      name: /se acabaron los intentos/i,
    });
    expect(quotaDialog).toHaveTextContent(/11 envíos de hoy en faltón/i);
    expect(quotaDialog).toHaveTextContent(/vuelve mañana/i);
    await waitFor(() => {
      expect(mocks.usage.refresh).toHaveBeenCalledOnce();
      expect(mocks.session.refresh).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText(SUBMITTED_ROAST)).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("textbox", { name: ROAST_INPUT_LABEL }),
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: ROAST_PLAN_CALLOUT_HEADING }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole("textbox", { name: ROAST_INPUT_LABEL }),
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: ROAST_PLAN_CALLOUT_HEADING }),
    ).toBeInTheDocument();
    expect(screen.queryByText(FIRST_SAMPLE_ROAST)).not.toBeInTheDocument();
  });

  it("hides demo exchanges for a Faltón user with roast history from the ranking counter", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: 0,
      roasts: 11,
      ideasPlanActive: false,
      roastsPlanActive: true,
      roastMessagesSent: 2,
    };

    render(<Roast />);

    expect(screen.queryByText(FIRST_SAMPLE_ROAST)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("11 de 11 envíos disponibles hoy"),
    ).toBeInTheDocument();
  });

  it("clarifies that only the opening exchanges are examples", () => {
    render(<Roast />);

    expect(
      screen.getByText(
        /los intercambios iniciales son ejemplos\. tus mensajes reciben la respuesta configurada en el servidor/i,
      ),
    ).toBeInTheDocument();
  });

  it("hides demo exchanges when a Faltón user already used the anonymous quota", () => {
    mocks.session.isAuthenticated = true;
    mocks.session.accountAttempts = {
      ideas: 0,
      roasts: 11,
      ideasPlanActive: false,
      roastsPlanActive: true,
      roastMessagesSent: 0,
    };
    mocks.usage.usage = {
      ideas: { limit: 3, used: 0, remaining: 3 },
      roasts: { limit: 3, used: 1, remaining: 2 },
    };

    render(<Roast />);

    expect(screen.queryByText(FIRST_SAMPLE_ROAST)).not.toBeInTheDocument();
  });

  it("replaces the demo with the user's submitted exchange and scrolls it into view", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ reply: SERVER_ROAST_REPLY }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Roast />);
    const thread = container.querySelector(".roast-thread");
    if (!thread) throw new Error("Roast thread was not rendered");
    Object.defineProperty(thread, "scrollHeight", {
      configurable: true,
      value: 640,
    });

    expect(screen.getByText(FIRST_SAMPLE_ROAST)).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: ROAST_INPUT_LABEL }),
      SUBMITTED_ROAST,
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_ROAST_LABEL }));

    await waitFor(() => {
      expect(screen.queryByText(FIRST_SAMPLE_ROAST)).not.toBeInTheDocument();
    });
    expect(screen.getByText(SUBMITTED_ROAST)).toBeInTheDocument();
    expect(screen.getByText(SERVER_ROAST_REPLY)).toBeInTheDocument();
    expect(thread.scrollTop).toBe(640);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("loads and displays the roast ranking", async () => {
    mocks.getRoastRanking.mockResolvedValue([
      { username: "GrumpyWinner", roastMessagesSent: 30 },
      { username: "TeaSpiller", roastMessagesSent: 21 },
    ]);

    const { container } = render(<Roast />);

    await waitFor(() => {
      expect(screen.getByText("GrumpyWinner")).toBeInTheDocument();
    });
    expect(screen.getByText("TeaSpiller")).toBeInTheDocument();
    const sidebar = container.querySelector(".roast-sidebar");
    expect(sidebar).toContainElement(
      screen.getByRole("region", { name: /faltón máximo/i }),
    );
    expect(sidebar).toContainElement(
      screen.getByRole("heading", { name: ROAST_PLAN_CALLOUT_HEADING }),
    );
  });
});
