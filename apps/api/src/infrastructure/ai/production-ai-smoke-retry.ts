const RETRYABLE_SMOKE_DIAGNOSTIC = "visible_message";
const MAX_EVALUATION_SMOKE_ATTEMPTS = 2;
const EVALUATION_SMOKE_RETRY_DELAY_MS = 1_000;

function isRetryableEvaluationSmokeError(error: unknown): boolean {
  if (!(error instanceof Error) || !("applicationErrorDiagnostic" in error)) {
    return false;
  }

  const diagnostic = error.applicationErrorDiagnostic;
  return (
    typeof diagnostic === "string" && diagnostic === RETRYABLE_SMOKE_DIAGNOSTIC
  );
}

function waitBeforeRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runEvaluationSmokeWithRetry<T>(
  evaluate: () => Promise<T>,
  wait: (delayMs: number) => Promise<void> = waitBeforeRetry,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= MAX_EVALUATION_SMOKE_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await evaluate();
    } catch (error) {
      if (
        !isRetryableEvaluationSmokeError(error) ||
        attempt === MAX_EVALUATION_SMOKE_ATTEMPTS
      ) {
        throw error;
      }

      await wait(EVALUATION_SMOKE_RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error("Evaluation smoke attempts exhausted.");
}
