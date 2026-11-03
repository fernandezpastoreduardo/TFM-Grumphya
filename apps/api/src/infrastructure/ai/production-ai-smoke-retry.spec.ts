import { describe, expect, it, vi } from "vitest";
import { runEvaluationSmokeWithRetry } from "./production-ai-smoke-retry";

const RETRYABLE_DIAGNOSTIC = "visible_message";
const SUCCESSFUL_EVALUATION = { status: "SIN_BLOQUEO_EVIDENTE" };

function createSmokeError(diagnostic: string): Error {
  return Object.assign(new Error("Evaluation smoke failed."), {
    applicationErrorDiagnostic: diagnostic,
  });
}

describe("production evaluation smoke retries", () => {
  it("retries a visible-message validation failure and returns a later success", async () => {
    const evaluate = vi
      .fn<() => Promise<typeof SUCCESSFUL_EVALUATION>>()
      .mockRejectedValueOnce(createSmokeError(RETRYABLE_DIAGNOSTIC))
      .mockResolvedValueOnce(SUCCESSFUL_EVALUATION);
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(runEvaluationSmokeWithRetry(evaluate, wait)).resolves.toBe(
      SUCCESSFUL_EVALUATION,
    );

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  it("allows at most two evaluations for repeated visible-message failures", async () => {
    const finalError = createSmokeError(RETRYABLE_DIAGNOSTIC);
    const evaluate = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(finalError);
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(runEvaluationSmokeWithRetry(evaluate, wait)).rejects.toBe(
      finalError,
    );

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls).toEqual([[1_000]]);
  });

  it.each([
    "evaluator_not_configured",
    "decision_semantics",
    "visible_message ",
  ])(
    "does not retry an evaluation failure with diagnostic %j",
    async (diagnostic) => {
      const failure = createSmokeError(diagnostic);
      const evaluate = vi.fn<() => Promise<never>>().mockRejectedValue(failure);
      const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

      await expect(runEvaluationSmokeWithRetry(evaluate, wait)).rejects.toBe(
        failure,
      );

      expect(evaluate).toHaveBeenCalledOnce();
      expect(wait).not.toHaveBeenCalled();
    },
  );

  it("stops retrying if a retryable failure is followed by a different failure", async () => {
    const finalError = createSmokeError("decision_semantics");
    const evaluate = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(createSmokeError(RETRYABLE_DIAGNOSTIC))
      .mockRejectedValueOnce(finalError);
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(runEvaluationSmokeWithRetry(evaluate, wait)).rejects.toBe(
      finalError,
    );

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  it("does not retry an ordinary error without an application diagnostic", async () => {
    const failure = new Error("visible_message");
    const evaluate = vi.fn<() => Promise<never>>().mockRejectedValue(failure);
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(runEvaluationSmokeWithRetry(evaluate, wait)).rejects.toBe(
      failure,
    );

    expect(evaluate).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });
});
