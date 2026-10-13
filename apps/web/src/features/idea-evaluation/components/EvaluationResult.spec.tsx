import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvaluationProcessResult } from "../evaluation-process";
import { EvaluationResult } from "./EvaluationResult";

const SCORED_RESULT: EvaluationProcessResult = {
  status: "RECHAZADA",
  score: 1.3,
  headline: "Pues… no decepciona; no esperaba gran cosa.",
  message:
    "Ignorar el consentimiento no es una estrategia, aunque el formulario te deje intentarlo.",
};

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
