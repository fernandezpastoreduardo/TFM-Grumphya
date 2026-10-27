import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvaluationProcessResult } from "../evaluation-process";
import { EvaluationResult } from "./EvaluationResult";

const SCORED_RESULT: EvaluationProcessResult = {
  status: "RECHAZADA",
  score: 1.3,
  headline: "La propuesta se ha estampado contra lo esencial.",
  message:
    "Ignorar el consentimiento no es una estrategia, aunque el formulario te deje intentarlo.",
  failedCriteria: [
    "La idea deja la puerta abierta a tus datos.",
    "Las cuentas no salen ni con calculadora.",
  ],
};
const EXISTING_PRODUCT_EXAMPLE = "Strava";

describe("EvaluationResult", () => {
  it("shows the app-style headline, score in Spanish notation, and specific findings", () => {
    render(<EvaluationResult result={SCORED_RESULT} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      SCORED_RESULT.headline,
    );
    expect(screen.queryByText(/bloqueo/i)).not.toBeInTheDocument();
    expect(screen.getByText("1,30/10")).toBeInTheDocument();
    expect(screen.getByText(SCORED_RESULT.message)).toBeInTheDocument();
    expect(screen.getAllByText(SCORED_RESULT.message)).toHaveLength(1);
  });

  it("lists every failed criterion with a red cross and user-facing wording", () => {
    const { container } = render(<EvaluationResult result={SCORED_RESULT} />);

    expect(
      screen.getByRole("heading", {
        name: "Puntos que hacen suspender la idea",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("La idea deja la puerta abierta a tus datos."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Las cuentas no salen ni con calculadora."),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(".evaluation-result-failed-criterion-icon"),
    ).toHaveLength(2);
    expect(
      screen.queryByText(/privacidad estructural|economía incompatible/i),
    ).not.toBeInTheDocument();
  });

  it("does not render the failed-criteria section when there are no failed criteria", () => {
    render(
      <EvaluationResult
        result={{
          ...SCORED_RESULT,
          status: "SIN_BLOQUEO_EVIDENTE",
          failedCriteria: [],
        }}
      />,
    );

    expect(
      screen.queryByRole("heading", {
        name: "Puntos que hacen suspender la idea",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a known similar product when the evaluator identifies one", () => {
    render(
      <EvaluationResult
        result={{
          ...SCORED_RESULT,
          existingProductExample: EXISTING_PRODUCT_EXAMPLE,
        }}
      />,
    );

    expect(
      screen.getByText("Ejemplo conocido con funciones similares:"),
    ).toBeInTheDocument();
    expect(screen.getByText(EXISTING_PRODUCT_EXAMPLE)).toBeInTheDocument();
  });

  it("does not show a known product example for a non-rejected result", () => {
    render(
      <EvaluationResult
        result={{
          ...SCORED_RESULT,
          status: "SIN_BLOQUEO_EVIDENTE",
          existingProductExample: EXISTING_PRODUCT_EXAMPLE,
        }}
      />,
    );

    expect(
      screen.queryByText("Ejemplo conocido con funciones similares:"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(EXISTING_PRODUCT_EXAMPLE),
    ).not.toBeInTheDocument();
  });

  it("does not show the literal null sentinel as a product name", () => {
    render(
      <EvaluationResult
        result={{
          ...SCORED_RESULT,
          existingProductExample: "null",
        }}
      />,
    );

    expect(
      screen.queryByText("Ejemplo conocido con funciones similares:"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
  });

  it("shows no numeric score for an insufficient idea and renders message as text", () => {
    const untrustedMessage = '<img src=x onerror="alert(1)">';
    const untrustedHeadline = '<svg onload="alert(1)">';
    const insufficientResult: EvaluationProcessResult = {
      status: "IDEA_INSUFICIENTE",
      score: null,
      headline: untrustedHeadline,
      message: untrustedMessage,
    };
    const { container } = render(
      <EvaluationResult result={insufficientResult} />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      insufficientResult.headline,
    );
    expect(screen.getByText(/sin puntuación/i)).toBeInTheDocument();
    expect(screen.getAllByText(untrustedMessage)).toHaveLength(1);
    expect(screen.getByText(untrustedHeadline)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
