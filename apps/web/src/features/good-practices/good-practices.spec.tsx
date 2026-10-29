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
    expect(
      screen.getByText(/te hace perder el control del proyecto/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/fallos de seguridad.*difícil de mantener/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no pongas ese código en manos de usuarios/i),
    ).toBeInTheDocument();
    expect(container.querySelector(".calm-mascot")).toHaveAttribute(
      "src",
      "/assets/grumphya/good-practices-validate-idea.svg",
    );
    expect(container.querySelectorAll(".practice-companion")).toHaveLength(2);
  });
});
