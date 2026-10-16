import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserProfile } from "./user-profile";

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));

const ACCOUNT_PROFILE = {
  user: {
    email: "persona@example.es",
    username: "persona-lista",
    emailVerified: false,
    createdAt: "2026-10-16T12:00:00.000Z",
  },
  plans: [
    {
      plan: "ILUMINADO",
      status: "active",
      startsAt: "2026-10-16T12:00:00.000Z",
      expiresAt: "2026-11-16T12:00:00.000Z",
      attemptsRemaining: { ideas: 11, roasts: 0 },
    },
    {
      plan: "FALTON",
      status: "inactive",
      startsAt: null,
      expiresAt: null,
      attemptsRemaining: { ideas: 0, roasts: 0 },
    },
  ],
};
const GOOD_IDEAS = {
  ideas: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Agenda compartida para equipos pequeños",
      createdAt: "2026-10-14T12:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      title: "Mapa de comercios accesibles del barrio",
      createdAt: "2026-10-09T12:00:00.000Z",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("UserProfile", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/account/good-ideas"
          ? jsonResponse(GOOD_IDEAS)
          : jsonResponse(ACCOUNT_PROFILE),
      ),
    );
  });

  it("loads account details, plan state, attempts and the pending email notice", async () => {
    render(<UserProfile />);

    expect(
      await screen.findByRole("heading", { name: "persona-lista" }),
    ).toBeInTheDocument();
    expect(screen.getByText("persona@example.es")).toBeInTheDocument();
    expect(screen.getByText(/correo sin verificar/i)).toBeInTheDocument();
    expect(
      screen.getByText(/11 de 11 evaluaciones disponibles hoy/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/0 de 11 envíos disponibles hoy/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/account/profile", undefined);
    expect(fetch).toHaveBeenCalledWith("/api/account/good-ideas", undefined);
    expect(
      screen.getByRole("row", {
        name: /agenda compartida para equipos pequeños/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 ideas")).toBeInTheDocument();
  });

  it("shows an empty state instead of a sample table when there are no approved ideas", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === "/api/account/good-ideas"
        ? jsonResponse({ ideas: [] })
        : jsonResponse(ACCOUNT_PROFILE),
    );
    render(<UserProfile />);

    expect(
      await screen.findByText(
        /todavía no tienes ideas aprobadas guardadas en tu perfil/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: /últimas ideas aprobadas/i }),
    ).not.toBeInTheDocument();
  });

  it("purchases only an inactive plan through the simulated payment dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/account/profile")
        return jsonResponse(ACCOUNT_PROFILE);
      if (String(input) === "/api/account/good-ideas")
        return jsonResponse(GOOD_IDEAS);
      expect(init?.method).toBe("POST");
      expect(String(input)).toBe("/api/account/subscriptions/purchase");
      expect(JSON.parse(String(init?.body))).toEqual({ plan: "FALTON" });
      expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(
        /^[0-9a-f-]{36}$/i,
      );
      return jsonResponse({
        ...ACCOUNT_PROFILE,
        plans: [
          ACCOUNT_PROFILE.plans[0],
          {
            ...ACCOUNT_PROFILE.plans[1],
            status: "active",
            startsAt: "2026-10-16T12:00:00.000Z",
            expiresAt: "2026-11-16T12:00:00.000Z",
            attemptsRemaining: { ideas: 0, roasts: 11 },
          },
        ],
      });
    });
    render(<UserProfile />);

    await screen.findByRole("heading", { name: "persona-lista" });
    expect(
      screen.getByRole("button", { name: "Pagar un café" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /baja.*iluminado/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pagar un café" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      /activando tu plan faltón/i,
    );
    expect(
      screen.getByText(/11 de 11 envíos disponibles hoy/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pagar un café" }),
    ).not.toBeInTheDocument();
  });
});
