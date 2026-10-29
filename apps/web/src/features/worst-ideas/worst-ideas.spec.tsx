import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorstIdeas, WorstIdeasAll, WorstIdeasAllTime } from "./worst-ideas";

const RANKING = [
  { safeTitle: "Una suscripción a los lunes", weeklyCount: 4 },
  { safeTitle: "Una app para ordenar calcetines", weeklyCount: 2 },
];
const ALL_TIME_RANKING = [
  { safeTitle: "La red social de las tostadoras", count: 14 },
  { safeTitle: "Una app para ordenar calcetines", count: 8 },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("WorstIdeasAll", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const responseBody = String(input).endsWith("/all-time")
          ? ALL_TIME_RANKING
          : RANKING;
        return Promise.resolve(jsonResponse(responseBody));
      }),
    );
  });

  it("loads the public weekly ranking from the API", async () => {
    render(<WorstIdeasAll />);

    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);
    expect(
      await screen.findByRole("heading", {
        name: "Ideas que necesitan sentarse",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Una suscripción a los lunes")).toBeInTheDocument();
    expect(
      screen.getByText("Una app para ordenar calcetines"),
    ).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/worst-ideas",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        credentials: "omit",
      }),
    );
    expect(screen.queryByText(/datos de ejemplo/i)).not.toBeInTheDocument();
  });

  it("reserves space for the maximum public ranking while loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<WorstIdeasAll />);

    await screen.findByRole("status");
    await waitFor(() => {
      expect(
        document.querySelectorAll(".idea-ranking-skeleton-row"),
      ).toHaveLength(10);
    });
  });

  it("shows a useful error and a retry action when loading fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse(RANKING));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorstIdeasAll />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido cargar el ranking/i,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /volver a intentarlo/i }),
    );
    expect(
      await screen.findByText("Una suscripción a los lunes"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed API data instead of displaying an incomplete ranking", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse([{ safeTitle: "", weeklyCount: -1 }])),
    );
    render(<WorstIdeasAll />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido cargar el ranking/i,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders only safe titles and counts as text, ignoring private fields and markup", async () => {
    const unsafeMarkup = '<img src=x onerror="alert(1)" />';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            safeTitle: unsafeMarkup,
            weeklyCount: 3,
            author: "private@example.test",
            originalIdea: "Texto original confidencial",
          },
        ]),
      ),
    );
    render(<WorstIdeasAll />);

    expect(await screen.findByText(unsafeMarkup)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Texto original confidencial"),
    ).not.toBeInTheDocument();
  });

  it("shows the same retryable error when the API responds with a failure status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    render(<WorstIdeasAll />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido cargar el ranking/i,
    );
    expect(
      screen.getByRole("button", { name: /volver a intentarlo/i }),
    ).toBeEnabled();
  });

  it("shows an empty state when the API returns no ranked ideas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    render(<WorstIdeasAll />);

    expect(
      await screen.findByText(/esta semana no hay ideas en el ranking/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("keeps the personal history in its own aside", async () => {
    render(<WorstIdeas />);

    const allTimeCard = await screen.findByRole("region", {
      name: "Las peores ideas de todos los tiempos",
    });
    const weeklyCard = await screen.findByRole("region", {
      name: "Ideas que necesitan sentarse",
    });
    expect(allTimeCard.parentElement).toBe(weeklyCard.parentElement);
    expect(
      screen.getByRole("complementary", { name: "Tu historial" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "Tú también tienes tus pinitos.",
      }),
    ).toBeInTheDocument();
  });

  it("loads and labels the all-time public ranking separately from the weekly one", async () => {
    render(<WorstIdeasAllTime />);

    expect(
      await screen.findByRole("heading", {
        name: "Las peores ideas de todos los tiempos",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "Ranking histórico de ideas rechazadas",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("La red social de las tostadoras"),
    ).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/worst-ideas/all-time",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        credentials: "omit",
      }),
    );
  });

  it("shows the all-time-specific empty state when no historical entries exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    render(<WorstIdeasAllTime />);

    expect(
      await screen.findByText(/aún no hay ideas rechazadas para inaugurar/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
