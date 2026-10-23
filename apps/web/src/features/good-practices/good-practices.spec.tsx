import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoodPractices } from "./good-practices";

describe("GoodPractices", () => {
  it("shows the advice without a review notice and keeps the lower illustration", () => {
    const { container } = render(<GoodPractices />);

    expect(
      screen.getByRole("heading", {
        name: "Prototipar rápido está bien. Validar antes está mejor.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/contenido editorial en revisión/i)).toBeNull();
    expect(container.querySelector(".calm-mascot")).toHaveAttribute(
      "src",
      "/assets/grumphya/good-practices-validate-idea.png",
    );
    expect(container.querySelectorAll(".practice-companion")).toHaveLength(2);
  });
});
