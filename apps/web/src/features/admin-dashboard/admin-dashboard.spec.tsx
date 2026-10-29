import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./admin-dashboard";

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
}));

const dashboard = {
  revenue: { weeklyEur: 4, totalEur: 8 },
  maximumMonthlyCost: {
    iluminado: {
      averagePerAttemptUsd: 0.02,
      monthlyMaximumUsd: 6.6,
      pricedAttempts: 4,
    },
    falton: {
      averagePerAttemptUsd: 0.01,
      monthlyMaximumUsd: 3.3,
      pricedAttempts: 2,
    },
    dailyAttempts: 11,
    assumedDaysPerMonth: 30,
  },
  weeklyActivePlans: [
    { weekStart: "2026-10-12", iluminado: 1, falton: 2 },
    { weekStart: "2026-10-19", iluminado: 3, falton: 4 },
  ],
  annualFinance: {
    year: 2026,
    hostingMonthlyEur: 12,
    hostingStartsMonth: "2026-10",
    usdToEurRate: 0.9,
    exchangeRateSource: "BCE",
    exchangeRateAsOf: "2026-10-27",
    months: [
      {
        month: "2026-10",
        revenueEur: 10,
        aiCostUsd: 1.5,
        aiCostEur: 1.35,
        hostingEur: 12,
        expensesEur: 13.35,
        netEur: -3.35,
      },
    ],
  },
  estimatedAiCost: {
    weeklyUsd: 0.25,
    totalUsd: 1.5,
    weeklyAveragePerAccountUsd: 0.125,
    totalAveragePerAccountUsd: 0.75,
    activeRegisteredAccountCount: 2,
    activeAdminAccountCount: 1,
    weeklyByActor: {
      registeredUsersUsd: 0.1,
      adminsUsd: 0.05,
      anonymousUsd: 0.1,
    },
    totalByActor: {
      registeredUsersUsd: 0.8,
      adminsUsd: 0.2,
      anonymousUsd: 0.5,
    },
    weeklyTrend: [
      {
        weekStart: "2026-10-19",
        registeredUsersUsd: 0.1,
        adminsUsd: 0.05,
        anonymousUsd: 0.1,
        totalUsd: 0.25,
      },
    ],
    unpricedUsageEvents: 1,
  },
  errors: [
    {
      code: "INVALID_EVALUATION_RESPONSE",
      latestEventId: "42",
      weeklyCount: 2,
      totalCount: 4,
      lastOccurredAt: "2026-10-21T18:30:00.000Z",
      latestDiagnosticCode: "decision_semantics",
    },
  ],
};
const contacts = {
  messages: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      subject: "Una consulta",
      message: "Quería comentar una cosa.",
      createdAt: "2026-10-18T12:00:00.000Z",
      sender: { username: "persona", email: "persona@example.es" },
      reply: { status: "not_replied", attemptedAt: null, retryAllowed: false },
    },
  ],
};

describe("AdminDashboard", () => {
  beforeEach(async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("contact-messages") ? contacts : dashboard,
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
  });

  it("shows revenue, costs including admin and anonymous use, a trend chart, errors and contacts", async () => {
    render(<AdminDashboard />);
    expect(
      await screen.findByRole("heading", { name: "Hola, Jappy." }),
    ).toBeInTheDocument();
    const errorDetailLink = screen.getByRole("link", {
      name: /INVALID_EVALUATION_RESPONSE.*incoherencia/i,
    });
    expect(errorDetailLink).toHaveAttribute("target", "_blank");
    expect(errorDetailLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(errorDetailLink).toHaveAttribute("href", "/panel-control?error=42");
    expect(screen.getByText("Última vez")).toBeInTheDocument();
    expect(screen.getByText("decision_semantics")).toBeInTheDocument();
    expect(
      document.querySelector('time[datetime="2026-10-21T18:30:00.000Z"]'),
    ).toHaveTextContent(/21 oct 2026/i);
    expect(screen.getByText("Quería comentar una cosa.")).toBeInTheDocument();
    expect(screen.getByText("persona@example.es")).toBeInTheDocument();
    expect(
      screen.getByText(/incluye a usuarios registrados y admins activos/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Jappy · admin")).toHaveLength(3);
    expect(screen.getAllByText("Visitantes sin cuenta")).toHaveLength(3);
    expect(
      screen.getByRole("img", {
        name: /Gráfico de barras apiladas del coste semanal/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Coste medio estimado por cuenta · semana/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1,35\s*€/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Responder por correo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no se leen desde esta aplicación/),
    ).toBeInTheDocument();
  });

  it("shows per-operation monthly maximums and accessible plan and finance charts", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });

    expect(
      screen.getByRole("heading", { name: "Coste máximo iluminado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Coste máximo faltón" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/11 intentos al día.*30 días/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /usuarios activos por plan.*semana/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /ingresos y gastos.*2026/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^-3,35\s*€$/u, { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/12\s*€.*mes de hosting/i)).toBeInTheDocument();
    expect(screen.getByText(/pagos simulados/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /referencia fija del BCE/i }),
    ).toHaveAttribute(
      "href",
      "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    );
    await user.click(screen.getByText("Ver cifras por semana"));
    expect(
      screen.getByRole("table", { name: "Datos semanales por plan" }),
    ).toHaveTextContent(/2026-10-19.*3.*4/u);
    await user.click(screen.getByText("Ver cifras por mes"));
    expect(
      screen.getByRole("table", {
        name: "Datos mensuales de ingresos y gastos",
      }),
    ).toHaveTextContent(/2026-10.*10,00.*13,35.*-3,35/u);
  });

  it("shows a positive year-to-date balance without a plus sign", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    const positiveBalance = {
      ...dashboard,
      annualFinance: {
        ...dashboard.annualFinance,
        months: [
          {
            ...dashboard.annualFinance.months[0],
            revenueEur: 22.47,
            netEur: 9.12,
          },
        ],
      },
    };
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("contact-messages")
              ? contacts
              : positiveBalance,
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });
    expect(
      screen.getByText(/^9,12\s*€$/u, { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("adds every month into the year-to-date balance", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    const twoMonthBalance = {
      ...dashboard,
      annualFinance: {
        ...dashboard.annualFinance,
        months: [
          {
            ...dashboard.annualFinance.months[0],
            month: "2026-09",
            revenueEur: 2,
            aiCostUsd: 0,
            aiCostEur: 0,
            hostingEur: 0,
            expensesEur: 0,
            netEur: 2,
          },
          dashboard.annualFinance.months[0],
        ],
      },
    };
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("contact-messages")
              ? contacts
              : twoMonthBalance,
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });
    expect(
      screen.getByText(/^-1,35\s*€$/u, { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("marks monthly cost as unavailable when no priced attempt exists", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    const noSamples = {
      ...dashboard,
      maximumMonthlyCost: {
        ...dashboard.maximumMonthlyCost,
        falton: {
          averagePerAttemptUsd: null,
          monthlyMaximumUsd: null,
          pricedAttempts: 0,
        },
      },
    };
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("contact-messages") ? contacts : noSamples,
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });
    expect(
      screen.getByText(/Sin usos con precio registrado/i),
    ).toBeInTheDocument();
  });

  it("sends an admin reply without accepting a recipient from the browser", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    const user = userEvent.setup();
    vi.mocked(authenticatedFetch).mockImplementation(async (input) => {
      if (String(input).endsWith("/reply")) {
        return new Response(
          JSON.stringify({
            status: "sent",
            reference: "00000000-0000-4000-8000-000000000001",
            attemptedAt: "2026-10-20T10:00:00.000Z",
            retryAllowed: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify(
          String(input).includes("contact-messages") ? contacts : dashboard,
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    render(<AdminDashboard />);
    await user.click(
      await screen.findByRole("button", { name: "Responder por correo" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Respuesta para persona" }),
      "Gracias por escribirnos. Te respondemos pronto.",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviar respuesta por correo" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Respuesta enviada por correo.",
    );
    const request = vi
      .mocked(authenticatedFetch)
      .mock.calls.find((call) => String(call[0]).endsWith("/reply"));
    expect(request?.[1]?.body).toBe(
      JSON.stringify({
        response: "Gracias por escribirnos. Te respondemos pronto.",
      }),
    );
  });

  it("opens the benchmark, privacy-safe telemetry and security tabs", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });

    await user.click(screen.getByRole("tab", { name: "Benchmark de IA" }));
    expect(
      screen.getByRole("heading", {
        name: "Benchmark de evaluaciones y prompts",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/seis casos sintéticos/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Telemetría de IA" }));
    expect(
      screen.getByRole("heading", { name: "Telemetría de operaciones de IA" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no incluyen ideas, mensajes/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Pruebas de seguridad" }));
    expect(
      screen.getByRole("heading", { name: "Pruebas de seguridad" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Aislamiento entre cuentas/)).toBeInTheDocument();
  });

  it("supports arrow-key navigation between tabs", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    const summaryTab = await screen.findByRole("tab", { name: "Resumen" });
    summaryTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("tab", { name: "Benchmark de IA" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(
      screen.getByRole("tab", { name: "Pruebas de seguridad" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Telemetría de IA" })).toHaveFocus();
  });

  it("shows a generic failure when an admin endpoint rejects the request", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response('{"message":"private server detail"}', {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<AdminDashboard />);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Panel no disponible");
    expect(error).toHaveTextContent(
      "No se han podido consultar los datos del panel.",
    );
    expect(error).not.toHaveTextContent("private server detail");
  });

  it("fails closed when an admin response does not match the dashboard contract", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ data: "unexpected" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<AdminDashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se han podido consultar los datos del panel.",
    );
    expect(screen.queryByText("unexpected")).not.toBeInTheDocument();
  });
});
