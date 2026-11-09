import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvaluationDialog } from "./EvaluationDialog";

const FIRST_LOADING_STAGE = "Descartando graciosillos…";
const SECOND_LOADING_STAGE =
  "Consultando si a alguien más se le ha ocurrido tu idea…";
const THIRD_LOADING_STAGE = "Evaluando tu idea con el DEBIDO respeto…";
const LOADING_STAGE_INTERVAL_MS = 2_800;

afterEach(() => {
  vi.useRealTimers();
});

describe("EvaluationDialog", () => {
  it("shows an indeterminate loader with rotating process copy while evaluating", () => {
    vi.useFakeTimers();
    render(
      <EvaluationDialog open isEvaluating onClose={vi.fn()}>
        {null}
      </EvaluationDialog>,
    );

    const progressBar = screen.getByRole("progressbar", {
      name: "Progreso de la evaluación",
    });
    expect(screen.getByText(FIRST_LOADING_STAGE)).toBeInTheDocument();
    expect(progressBar).not.toHaveAttribute("aria-valuenow");
    expect(progressBar).not.toHaveAttribute("aria-valuetext");
    expect(screen.getByRole("status")).toHaveTextContent(FIRST_LOADING_STAGE);

    act(() => {
      vi.advanceTimersByTime(LOADING_STAGE_INTERVAL_MS);
    });
    expect(screen.getByText(SECOND_LOADING_STAGE)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(SECOND_LOADING_STAGE);

    act(() => {
      vi.advanceTimersByTime(LOADING_STAGE_INTERVAL_MS * 2);
    });
    expect(screen.getByText(THIRD_LOADING_STAGE)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(THIRD_LOADING_STAGE);
  });

  it("resets the stage announcement when a new evaluation starts", () => {
    vi.useFakeTimers();
    const dialog = render(
      <EvaluationDialog open isEvaluating onClose={vi.fn()}>
        {null}
      </EvaluationDialog>,
    );

    act(() => {
      vi.advanceTimersByTime(LOADING_STAGE_INTERVAL_MS * 2);
    });
    expect(screen.getByText(THIRD_LOADING_STAGE)).toBeInTheDocument();

    dialog.rerender(
      <EvaluationDialog open isEvaluating={false} onClose={vi.fn()}>
        {null}
      </EvaluationDialog>,
    );
    expect(
      screen.queryByRole("progressbar", {
        name: "Progreso de la evaluación",
      }),
    ).not.toBeInTheDocument();

    dialog.rerender(
      <EvaluationDialog open isEvaluating onClose={vi.fn()}>
        {null}
      </EvaluationDialog>,
    );
    const progressBar = screen.getByRole("progressbar", {
      name: "Progreso de la evaluación",
    });
    expect(screen.getByText(FIRST_LOADING_STAGE)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(FIRST_LOADING_STAGE);

    act(() => {
      vi.advanceTimersByTime(LOADING_STAGE_INTERVAL_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(SECOND_LOADING_STAGE);
    expect(progressBar).not.toHaveAttribute("aria-valuetext");
  });
});
