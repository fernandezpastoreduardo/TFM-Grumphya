import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./admin-dashboard";

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
}));

const dashboard = {
  revenue: { weeklyEur: 4, totalEur: 8 },
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
  errors: [{ code: "EVALUATOR_UNAVAILABLE", weeklyCount: 2, totalCount: 4 }],
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
    expect(screen.getByText("EVALUATOR_UNAVAILABLE")).toBeInTheDocument();
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
      screen.getByText(/Coste medio por cuenta · semana/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Responder por correo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no se leen desde esta aplicación/),
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
