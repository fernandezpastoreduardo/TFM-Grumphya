import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoastInput } from "./RoastInput";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(async () => null as string | null),
  authenticatedFetch: vi.fn(),
  fetch: vi.fn(),
  onSubmitted: vi.fn(),
  onUsageRefresh: vi.fn(async () => undefined),
  onReplyUnavailable: vi.fn(),
}));

vi.mock("../../../infrastructure/auth/session", () => ({
  authenticatedFetch: mocks.authenticatedFetch,
  getAccessToken: mocks.getAccessToken,
}));

describe("RoastInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue(null);
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ reply: "Buen intento." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.authenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify({ reply: "Buen intento." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("submits a trimmed message with cookie credentials and idempotency, then renders quota feedback", async () => {
    const user = userEvent.setup();
    render(
      <RoastInput
        remainingAttempts={2}
        quotaLimit={3}
        quotaDescription="envíos gratuitos restantes"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /tu insulto/i }),
      "  Qué tal  ",
    );
    await user.click(screen.getByRole("button", { name: "Enviar insulto" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    const [endpoint, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("/api/roast");
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(new Headers(init.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(JSON.parse(String(init.body))).toEqual({ message: "Qué tal" });
    expect(mocks.onSubmitted).toHaveBeenCalledWith("Qué tal", "Buen intento.");
    expect(mocks.onUsageRefresh).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /te quedan 1 de 3/i,
    );
  });

  it("uses the authenticated request when a session token is available", async () => {
    mocks.getAccessToken.mockResolvedValue("token");
    const user = userEvent.setup();
    render(
      <RoastInput
        remainingAttempts={11}
        quotaLimit={11}
        quotaDescription="envíos disponibles hoy"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /tu insulto/i }),
      "Hola",
    );
    await user.click(screen.getByRole("button", { name: "Enviar insulto" }));

    await waitFor(() =>
      expect(mocks.authenticatedFetch).toHaveBeenCalledOnce(),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions while the request is in flight", async () => {
    let resolveResponse: (response: Response) => void = () => undefined;
    mocks.fetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const user = userEvent.setup();
    render(
      <RoastInput
        remainingAttempts={2}
        quotaLimit={3}
        quotaDescription="envíos gratuitos restantes"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );
    const input = screen.getByRole("textbox", { name: /tu insulto/i });
    await user.type(input, "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar insulto" }));
    await user.click(screen.getByRole("button", { name: "Enviando" }));

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(input).toBeDisabled();
    resolveResponse(
      new Response(JSON.stringify({ reply: "Vaya." }), { status: 200 }),
    );
    await waitFor(() => expect(mocks.onSubmitted).toHaveBeenCalledOnce());
  });

  it("shows a readable error and preserves the draft after a failed request", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ message: "Te has quedado sin envíos." }), {
        status: 429,
      }),
    );
    const user = userEvent.setup();
    render(
      <RoastInput
        remainingAttempts={1}
        quotaLimit={3}
        quotaDescription="envíos gratuitos restantes"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );
    const input = screen.getByRole("textbox", { name: /tu insulto/i });
    await user.type(input, "Mi borrador");
    await user.click(screen.getByRole("button", { name: "Enviar insulto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Te has quedado sin envíos.",
    );
    expect(input).toHaveValue("Mi borrador");
    expect(mocks.onSubmitted).not.toHaveBeenCalled();
    expect(mocks.onReplyUnavailable).not.toHaveBeenCalled();
  });

  it("opens the unavailable-reply flow and preserves the draft", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "ROAST_REPLY_UNAVAILABLE",
          message: "La respuesta no está disponible.",
        }),
        { status: 503 },
      ),
    );
    const user = userEvent.setup();
    render(
      <RoastInput
        remainingAttempts={2}
        quotaLimit={3}
        quotaDescription="envíos gratuitos restantes"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );
    const input = screen.getByRole("textbox", { name: /tu insulto/i });
    await user.type(input, "Mi idea de roast");
    await user.click(screen.getByRole("button", { name: "Enviar insulto" }));

    await waitFor(() =>
      expect(mocks.onReplyUnavailable).toHaveBeenCalledOnce(),
    );
    expect(input).toHaveValue("Mi idea de roast");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.onSubmitted).not.toHaveBeenCalled();
    expect(mocks.onUsageRefresh).not.toHaveBeenCalled();
  });

  it("does not allow blank messages or send when attempts are exhausted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RoastInput
        remainingAttempts={1}
        quotaLimit={3}
        quotaDescription="envíos gratuitos restantes"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );
    const textbox = screen.getByRole("textbox", { name: /tu insulto/i });
    expect(
      screen.getByRole("button", { name: "Enviar insulto" }),
    ).toBeDisabled();
    await user.type(textbox, "   ");
    expect(
      screen.getByRole("button", { name: "Enviar insulto" }),
    ).toBeDisabled();

    rerender(
      <RoastInput
        remainingAttempts={0}
        quotaLimit={3}
        quotaDescription="envíos gratuitos restantes"
        onSubmitted={mocks.onSubmitted}
        onUsageRefresh={mocks.onUsageRefresh}
        onReplyUnavailable={mocks.onReplyUnavailable}
      />,
    );
    expect(textbox).toBeDisabled();
    expect(screen.getByText(/te quedan 0 de 3/i)).toBeInTheDocument();
  });
});
