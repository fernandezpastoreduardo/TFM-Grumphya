import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "../../../infrastructure/auth/session";
import { AdminErrorDetail } from "./admin-error-detail";

vi.mock("../../../infrastructure/auth/session", () => ({
  authenticatedFetch: vi.fn(),
}));

const IDEA_TEXT = "Una app para ordenar cajas en un camión";
const EVALUATION_ERROR_CODE = "INVALID_EVALUATION_RESPONSE";
const EVALUATION_DIAGNOSTIC_CODE = "decision_semantics";
const OCCURRED_AT = "2026-10-24T10:30:00.000Z";
const DETAIL_ENDPOINT = "/api/admin/application-errors/42";
const INVALID_DETAIL_MESSAGE =
  "No se ha podido cargar el detalle de este error.";

describe("AdminErrorDetail", () => {
  beforeEach(() => {
    vi.mocked(authenticatedFetch).mockClear();
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "42",
          code: EVALUATION_ERROR_CODE,
          statusCode: 503,
          occurredAt: OCCURRED_AT,
          diagnosticCode: EVALUATION_DIAGNOSTIC_CODE,
          context: { useCase: "idea_evaluation", inputText: IDEA_TEXT },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  it("shows the safe diagnosis and excludes submitted idea text", async () => {
    render(<AdminErrorDetail eventId="42" />);

    expect(
      await screen.findByRole("heading", {
        name: /incoherencia entre decisión y criterios/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("No identificado")).toBeInTheDocument();
    expect(
      screen.getByText(/no incluye texto enviado por usuarios/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(IDEA_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    expect(authenticatedFetch).toHaveBeenCalledWith(DETAIL_ENDPOINT);
  });

  it("never displays historical idea text or renders it as markup", async () => {
    const injectedText = '<script>alert("idea")</script>';
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "42",
          code: EVALUATION_ERROR_CODE,
          statusCode: 503,
          occurredAt: OCCURRED_AT,
          diagnosticCode: EVALUATION_DIAGNOSTIC_CODE,
          context: { useCase: "idea_evaluation", inputText: injectedText },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<AdminErrorDetail eventId="42" />);

    expect(
      await screen.findByText(/no incluye texto enviado por usuarios/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(injectedText)).not.toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("explains that event details do not expose submitted text", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "42",
          code: "HTTP_500",
          statusCode: 500,
          occurredAt: OCCURRED_AT,
          diagnosticCode: null,
          context: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<AdminErrorDetail eventId="42" />);

    expect(
      await screen.findByText(/no incluye texto enviado por usuarios/i),
    ).toBeInTheDocument();
  });

  it("hides an event response for a different event id", async () => {
    const body = {
      id: "43",
      code: EVALUATION_ERROR_CODE,
      statusCode: 503,
      occurredAt: OCCURRED_AT,
      diagnosticCode: EVALUATION_DIAGNOSTIC_CODE,
      context: null,
    };
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<AdminErrorDetail eventId="42" />);

    expect(
      await screen.findByRole("heading", { name: "Error no disponible" }),
    ).toBeInTheDocument();
    expect(screen.getByText(INVALID_DETAIL_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/x{100}/)).not.toBeInTheDocument();
  });

  it("does not make a request for an invalid event id", async () => {
    render(<AdminErrorDetail eventId="../42" />);

    expect(
      await screen.findByRole("heading", { name: "Error no disponible" }),
    ).toBeInTheDocument();
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });
});
