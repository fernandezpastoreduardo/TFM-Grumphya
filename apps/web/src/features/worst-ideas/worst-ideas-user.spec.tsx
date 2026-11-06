import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "../../infrastructure/auth/session";
import { WorstIdeasUser } from "./worst-ideas-user";

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
}));

const USER_HISTORY_ENDPOINT = "/api/account/worst-ideas";
const USER_IDEAS = [
  { safeTitle: "Un club para intercambiar calcetines", count: 4 },
  { safeTitle: "Una red social para tostadoras", count: 2 },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const authenticatedFetchMock = vi.mocked(authenticatedFetch);

describe("WorstIdeasUser", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(jsonResponse(USER_IDEAS));
  });

  it("loads the signed-in user's safe rejected idea history", async () => {
    render(<WorstIdeasUser />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /cargando tu historial/i,
    );
    expect(
      await screen.findByText("Un club para intercambiar calcetines"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Una red social para tostadoras"),
    ).toBeInTheDocument();
    expect(screen.getByText("4").parentElement).toHaveTextContent("4veces");
    expect(screen.getByText("2").parentElement).toHaveTextContent("2veces");
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      USER_HISTORY_ENDPOINT,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows the prototype's account prompt when the visitor is signed out", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({}, 401));
    render(<WorstIdeasUser />);

    expect(
      await screen.findByRole("heading", {
        name: "Tú también tienes tus pinitos.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /cuando tengas cuenta, aquí podrás revisar tus ideas rechazadas/i,
      ),
    ).toBeInTheDocument();
    const plansLink = screen.getByRole("link", {
      name: /ver planes para crear una cuenta/i,
    });
    expect(plansLink).toHaveAttribute("href", "/precios");
    expect(plansLink).toHaveClass("worst-ideas-history-cta");
  });

  it("shows the signed-in empty state when the user has no rejected ideas", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse([]));
    render(<WorstIdeasUser />);

    expect(
      await screen.findByRole("heading", {
        name: "Tú también harás tus pinitos.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /cuando plantes alguno, aquí podrás revisar tus ideas rechazadas/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rejects malformed responses and provides a retry action", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse([{ safeTitle: "", count: -1 }]))
      .mockResolvedValueOnce(jsonResponse(USER_IDEAS));
    render(<WorstIdeasUser />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido cargar tu historial/i,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /volver a intentarlo/i }),
    );
    expect(
      await screen.findByText("Un club para intercambiar calcetines"),
    ).toBeInTheDocument();
  });

  it.each([
    { label: "HTML count", count: '<img src=x onerror="alert(1)">' },
    { label: "fraction", count: 1.5 },
    { label: "unsafe integer", count: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects an invalid $label in the private history", async ({ count }) => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse([{ safeTitle: "Una idea registrada", count }]),
    );
    render(<WorstIdeasUser />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido cargar tu historial/i,
    );
    expect(screen.queryByText("Una idea registrada")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Tus ideas rechazadas" }),
    ).not.toBeInTheDocument();
  });

  it("shows a recoverable error for a failed request and retries successfully", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(USER_IDEAS));
    render(<WorstIdeasUser />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido cargar tu historial/i,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /volver a intentarlo/i }),
    );
    expect(
      await screen.findByText("Una red social para tostadoras"),
    ).toBeInTheDocument();
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders only safe titles and counts, ignoring private fields and markup", async () => {
    const unsafeMarkup = '<img src=x onerror="alert(1)" />';
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse([
        {
          safeTitle: unsafeMarkup,
          count: 3,
          originalIdea: "Texto original privado",
          userId: "private-user-id",
        },
      ]),
    );
    render(<WorstIdeasUser />);

    expect(await screen.findByText(unsafeMarkup)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Texto original privado"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("private-user-id")).not.toBeInTheDocument();
  });
});
