import type {
  EvaluationProcessResult,
  SimilarIdeaMatchResult,
  SpecialIdeaCaseResult,
} from "./evaluation-process";

export function getIdeaAttemptsRemaining(
  isAuthenticated: boolean | null,
  anonymousRemaining: number | undefined,
  accountRemaining: number | undefined,
  hasActiveIdeaPlan: boolean | null,
): number | null | undefined {
  if (isAuthenticated === true) {
    if (hasActiveIdeaPlan === null) return null;
    return hasActiveIdeaPlan ? (accountRemaining ?? null) : anonymousRemaining;
  }
  if (isAuthenticated === false) return anonymousRemaining ?? null;
  return null;
}

export function hasEvaluationFeedback(
  isEvaluating: boolean,
  evaluationError: string,
  evaluationResult: EvaluationProcessResult | null,
  similarIdeaMatch: SimilarIdeaMatchResult | null,
  specialIdeaCase: SpecialIdeaCaseResult | null,
): boolean {
  return Boolean(
    isEvaluating ||
    evaluationError ||
    evaluationResult ||
    similarIdeaMatch ||
    specialIdeaCase,
  );
}
