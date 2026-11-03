import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./admin-dashboard";

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
}));

const AI_ACTIVITY_TABLE_LABEL = "Actividad reciente agregada de IA";
const SECURITY_TAB_LABEL = "Seguridad y acceso";

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
  recentAiActivity: [
    {
      hour: "2026-10-29T11:00:00.000Z",
      operation: "idea_evaluation",
      model: "gpt-5.4-mini",
      eventCount: 3,
      inputTokenBucket: "5k_20k",
      cachedInputTokenBucket: "5k_20k",
      outputTokenBucket: "1k_5k",
      estimatedCostUsd: 0.01,
    },
    {
      hour: "2026-10-29T10:00:00.000Z",
      operation: "roast",
      model: "future-model",
      eventCount: 3,
      inputTokenBucket: "under_1k",
      cachedInputTokenBucket: "under_1k",
      outputTokenBucket: "under_1k",
      estimatedCostUsd: null,
    },
  ],
  loginSecurity: {
    windowMinutes: 15,
    loginRequests: 23,
    challengesIssued: 4,
    challengesAccepted: 2,
    challengesRejected: 1,
    failedLogins: 3,
    blockedRequests: 5,
    activeBlockedAddresses: 2,
    attackModeActive: true,
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
const anonymousAnalytics = {
  viewsByPage: [],
  deviceShares: [],
  monthlyPlanSelections: [],
  monthlyPlanActivations: [],
};

describe("AdminDashboard", () => {
  beforeEach(async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("anonymous-analytics")
              ? anonymousAnalytics
              : String(input).includes("contact-messages")
                ? contacts
                : dashboard,
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

  it("shows grouped anonymous metrics without claiming a person-level conversion", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    const metrics = {
      viewsByPage: [{ page: "precios", count: 25 }],
      deviceShares: [
        { device: "desktop", percentage: 60 },
        { device: "mobile", percentage: 40 },
      ],
      monthlyPlanSelections: [
        { month: "2026-11", plan: "ILUMINADO", count: 12 },
      ],
      monthlyPlanActivations: [
        { month: "2026-11", plan: "ILUMINADO", count: 10 },
      ],
    };
    vi.mocked(authenticatedFetch).mockImplementation(async (input) => {
      const path = String(input);
      const body = path.includes("anonymous-analytics")
        ? metrics
        : path.includes("contact-messages")
          ? contacts
          : dashboard;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });
    await user.click(screen.getByRole("tab", { name: "Analítica anónima" }));
    expect(
      screen.getByRole("heading", {
        name: "Páginas públicas más vistas · últimos 30 días cerrados",
      }),
    ).toBeVisible();
    expect(screen.getByText("Móvil · estrecha")).toBeVisible();
    expect(screen.getByText("40 %")).toBeVisible();
    expect(
      screen.getByText(/no se enlaza una vista con una selección/i),
    ).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
  });

  it("converts Jappy's weekly and accumulated AI costs to euros", async () => {
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Hola, Jappy." });

    const weeklyCosts = screen.getByRole("heading", {
      name: "Esta semana",
    }).parentElement;
    const accumulatedCosts = screen.getByRole("heading", {
      name: "Acumulado",
    }).parentElement;

    expect(weeklyCosts).not.toBeNull();
    expect(accumulatedCosts).not.toBeNull();
    expect(
      within(weeklyCosts as HTMLElement).getByText("Jappy · admin")
        .parentElement,
    ).toHaveTextContent(/0,045\s*€/u);
    expect(
      within(accumulatedCosts as HTMLElement).getByText("Jappy · admin")
        .parentElement,
    ).toHaveTextContent(/0,18\s*€/u);
  });

  it("shows empty recent activity and zero login counters", async () => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    const emptyMetrics = {
      ...dashboard,
      recentAiActivity: [],
      loginSecurity: {
        windowMinutes: 15 as const,
        loginRequests: 0,
        challengesIssued: 0,
        challengesAccepted: 0,
        challengesRejected: 0,
        failedLogins: 0,
        blockedRequests: 0,
        activeBlockedAddresses: 0,
        attackModeActive: false,
      },
    };
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("anonymous-analytics")
              ? anonymousAnalytics
              : String(input).includes("contact-messages")
                ? contacts
                : emptyMetrics,
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await user.click(
      await screen.findByRole("tab", { name: "Telemetría de IA" }),
    );
    expect(
      screen.getByText(
        "No hay grupos de tres o más usos en las últimas 24 horas.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: AI_ACTIVITY_TABLE_LABEL }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: SECURITY_TAB_LABEL }));
    expect(
      screen.getByText("Solicitudes de acceso").parentElement,
    ).toHaveTextContent("0");
    expect(screen.getByText("Modo de ataque").parentElement).toHaveTextContent(
      "Inactivo",
    );
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
            String(input).includes("anonymous-analytics")
              ? anonymousAnalytics
              : String(input).includes("contact-messages")
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
            String(input).includes("anonymous-analytics")
              ? anonymousAnalytics
              : String(input).includes("contact-messages")
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
            String(input).includes("anonymous-analytics")
              ? anonymousAnalytics
              : String(input).includes("contact-messages")
                ? contacts
                : noSamples,
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
          String(input).includes("anonymous-analytics")
            ? anonymousAnalytics
            : String(input).includes("contact-messages")
              ? contacts
              : dashboard,
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

  it("shows the benchmark report contract, aggregated AI activity and login metrics", async () => {
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
    expect(
      screen.getByText(
        "No hay ningún informe de benchmark guardado en este momento.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Versión de la política y fecha de generación/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Acuerdo con las decisiones esperadas/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/solo se emiten resultados agregados/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pnpm --filter/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Telemetría de IA" }));
    expect(
      screen.getByRole("heading", { name: "Telemetría de operaciones de IA" }),
    ).toBeInTheDocument();
    const recentActivityTable = screen.getByRole("table", {
      name: AI_ACTIVITY_TABLE_LABEL,
    });
    expect(recentActivityTable).toHaveTextContent("Evaluación de idea");
    expect(recentActivityTable).toHaveTextContent("gpt-5.4-mini");
    expect(recentActivityTable).toHaveTextContent("5.000–19.999");
    expect(recentActivityTable).toHaveTextContent("1.000–4.999");
    expect(recentActivityTable).toHaveTextContent(/0,009\s*€/u);
    expect(recentActivityTable).toHaveTextContent("Sin precio configurado");
    expect(
      recentActivityTable.querySelector(
        'time[datetime="2026-10-29T11:00:00.000Z"]',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/grupos de tres o más usos/)).toBeInTheDocument();
    expect(
      screen.queryByText(/user-secret|idea-secret|session-secret/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: SECURITY_TAB_LABEL }));
    expect(
      screen.getByRole("heading", {
        name: "Actividad de acceso y protección",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Solicitudes de acceso").parentElement,
    ).toHaveTextContent("23");
    expect(screen.getByText("Solicitudes de acceso")).toBeInTheDocument();
    expect(
      screen.getByText("Desafíos emitidos").parentElement,
    ).toHaveTextContent("4");
    expect(
      screen.getByText("Desafíos aceptados").parentElement,
    ).toHaveTextContent("2");
    expect(
      screen.getByText("Desafíos rechazados").parentElement,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Inicios de sesión fallidos").parentElement,
    ).toHaveTextContent("3");
    expect(
      screen.getByText("Solicitudes bloqueadas").parentElement,
    ).toHaveTextContent("5");
    expect(
      screen.getByText("Direcciones bloqueadas activas").parentElement,
    ).toHaveTextContent("2");
    expect(screen.getByText("Modo de ataque").parentElement).toHaveTextContent(
      "Activo",
    );
    expect(screen.getByText(/últimos 15 minutos/)).toBeInTheDocument();
    expect(screen.getByText(/volátiles en memoria/)).toBeInTheDocument();
    expect(
      screen.queryByText(/\b(?:\d{1,3}\.){3}\d{1,3}\b/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Pruebas de seguridad cubiertas/),
    ).toBeInTheDocument();
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
      screen.getByRole("tab", { name: "Analítica anónima" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: SECURITY_TAB_LABEL })).toHaveFocus();
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

  it.each([
    [
      "token volume uses an unsupported bucket",
      {
        ...dashboard,
        recentAiActivity: [
          { ...dashboard.recentAiActivity[0], inputTokenBucket: "exact-count" },
        ],
      },
    ],
    [
      "activity includes an identifier outside the contract",
      {
        ...dashboard,
        recentAiActivity: [
          { ...dashboard.recentAiActivity[0], userId: "private-user-id" },
        ],
      },
    ],
    [
      "activity contains a non-ISO hour",
      {
        ...dashboard,
        recentAiActivity: [
          { ...dashboard.recentAiActivity[0], hour: "ayer a las doce" },
        ],
      },
    ],
    [
      "activity contains an invalid model name",
      {
        ...dashboard,
        recentAiActivity: [
          { ...dashboard.recentAiActivity[0], model: "model private" },
        ],
      },
    ],
    [
      "activity repeats an aggregation bucket",
      {
        ...dashboard,
        recentAiActivity: [
          dashboard.recentAiActivity[0],
          dashboard.recentAiActivity[0],
        ],
      },
    ],
    [
      "login metrics use a different time window",
      {
        ...dashboard,
        loginSecurity: { ...dashboard.loginSecurity, windowMinutes: 60 },
      },
    ],
    [
      "login metrics are missing required fields",
      {
        ...dashboard,
        loginSecurity: {
          windowMinutes: 15,
          loginRequests: 0,
          attackModeActive: false,
        },
      },
    ],
    [
      "login metrics include a fractional count",
      {
        ...dashboard,
        loginSecurity: { ...dashboard.loginSecurity, failedLogins: 1.5 },
      },
    ],
    [
      "login metrics include a client address",
      {
        ...dashboard,
        loginSecurity: {
          ...dashboard.loginSecurity,
          address: "203.0.113.10",
        },
      },
    ],
    [
      "attack mode is not a boolean",
      {
        ...dashboard,
        loginSecurity: {
          ...dashboard.loginSecurity,
          attackModeActive: "active",
        },
      },
    ],
  ])("fails closed when %s", async (_caseName, invalidDashboard) => {
    const { authenticatedFetch } =
      await import("../../infrastructure/auth/session");
    vi.mocked(authenticatedFetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("anonymous-analytics")
              ? anonymousAnalytics
              : String(input).includes("contact-messages")
                ? contacts
                : invalidDashboard,
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    render(<AdminDashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se han podido consultar los datos del panel.",
    );
  });
});
