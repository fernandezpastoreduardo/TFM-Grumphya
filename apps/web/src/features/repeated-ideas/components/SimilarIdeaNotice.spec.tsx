import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SimilarIdeaNotice } from "./SimilarIdeaNotice";

const SIMILAR_IDEA_MATCH = {
  status: "similar_idea_match" as const,
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
});
