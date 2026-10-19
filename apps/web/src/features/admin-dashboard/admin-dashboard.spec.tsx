import { render, screen } from "@testing-library/react";
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
      id: "contact-1",
      subject: "Una consulta",
      message: "Quería comentar una cosa.",
      createdAt: "2026-10-18T12:00:00.000Z",
      sender: { username: "persona", email: "persona@example.es" },
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
