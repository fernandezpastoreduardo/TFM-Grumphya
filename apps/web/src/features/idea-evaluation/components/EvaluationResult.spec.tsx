import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvaluationProcessResult } from "../evaluation-process";
import { EvaluationResult } from "./EvaluationResult";

const SCORED_RESULT: EvaluationProcessResult = {
  status: "RECHAZADA",
  score: 1.3,
  message: "Menudo plan: ignorar el consentimiento no es una estrategia.",
};

describe("EvaluationResult", () => {
  it("shows the status, score in Spanish notation, and the single explanation", () => {
    render(<EvaluationResult result={SCORED_RESULT} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /idea rechazada/i,
    );
    expect(screen.getByText("1,30/10")).toBeInTheDocument();
    expect(screen.getByText(SCORED_RESULT.message)).toBeInTheDocument();
    expect(screen.getAllByText(SCORED_RESULT.message)).toHaveLength(1);
  });

  it("shows no numeric score for an insufficient idea and renders message as text", () => {
    const untrustedMessage = '<img src=x onerror="alert(1)">';
    const insufficientResult: EvaluationProcessResult = {
      status: "IDEA_INSUFICIENTE",
      score: null,
      message: untrustedMessage,
    };
    const { container } = render(
      <EvaluationResult result={insufficientResult} />,
    );

    expect(screen.getByText(/idea insuficiente/i)).toBeInTheDocument();
    expect(screen.getByText(/sin puntuación/i)).toBeInTheDocument();
    expect(screen.getByText(untrustedMessage)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
