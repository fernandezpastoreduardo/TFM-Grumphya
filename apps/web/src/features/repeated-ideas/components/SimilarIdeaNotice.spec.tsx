import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SimilarIdeaNotice } from "./SimilarIdeaNotice";

const SIMILAR_IDEA_MATCH = {
  status: "similar_idea_match" as const,
  headline: "Esta idea vuelve al ruedo con las mismas pintas.",
  safeTitle: "Tinder para saltamontes",
  submissionCount: 1,
};

describe("SimilarIdeaNotice", () => {
  it("shows a gentle message, the singular count and the next-evaluation notice", () => {
    render(
      <SimilarIdeaNotice
        match={SIMILAR_IDEA_MATCH}
        tone="soft"
        isSubmitting={false}
        onContinue={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: SIMILAR_IDEA_MATCH.headline,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/tinder para saltamontes/i)).toBeInTheDocument();
    expect(screen.getByText(/1 vez\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/cambiar la forma de contarla/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enviaremos esta idea a una nueva evaluación/i),
    ).toBeInTheDocument();
  });

  it("uses the hard tone when selected", () => {
    render(
      <SimilarIdeaNotice
        match={SIMILAR_IDEA_MATCH}
        tone="hard"
        isSubmitting={false}
        onContinue={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/ya se llevó un golpe y ha vuelto/i),
    ).toBeInTheDocument();
  });

  it("shows the plural count and disables continuation while submitting", () => {
    const onContinue = vi.fn();
    render(
      <SimilarIdeaNotice
        match={{ ...SIMILAR_IDEA_MATCH, submissionCount: 2 }}
        tone="soft"
        isSubmitting={true}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText(/2 veces\./i)).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: /preparando evaluación/i,
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
