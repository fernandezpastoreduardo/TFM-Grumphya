import { useRef, useState } from "react";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { usePendingEmailVerification } from "../../shared/hooks/use-pending-email-verification";
import type { EvaluationProcessError } from "./evaluation-process";
import type {
  EvaluationProcessResult,
  EvaluationSubmissionResult,
  SimilarIdeaMatchResult,
  SpecialIdeaCaseResult,
} from "./evaluation-process";
import { EVALUATION_FAILURE_MESSAGE } from "./evaluation.constants";
import type { HomeEvaluationRequest } from "./idea-evaluation.models";

export function useIdeaEvaluation(
  session: ReturnType<typeof useSessionStatus>,
  anonymousUsage: ReturnType<typeof useAnonymousUsage>,
) {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationProcessResult | null>(null);
  const [similarIdeaMatch, setSimilarIdeaMatch] =
    useState<SimilarIdeaMatchResult | null>(null);
  const [specialIdeaCase, setSpecialIdeaCase] =
    useState<SpecialIdeaCaseResult | null>(null);
  const [pendingEvaluation, setPendingEvaluation] = useState<{
    request: HomeEvaluationRequest;
    idempotencyKey: string;
  } | null>(null);
  const [evaluationError, setEvaluationError] = useState("");
  const [isEvaluationDialogOpen, setIsEvaluationDialogOpen] = useState(false);
  const [ideaStepResetKey, setIdeaStepResetKey] = useState(0);
  const [isQuotaDialogOpen, setIsQuotaDialogOpen] = useState(false);
  const [isDailyQuotaDialogOpen, setIsDailyQuotaDialogOpen] = useState(false);
  const [isEmailVerificationDialogOpen, setIsEmailVerificationDialogOpen] =
    useState(false);
  const isEvaluationSubmittingRef = useRef(false);
  const retryableSubmissionRef = useRef<{
    request: HomeEvaluationRequest;
    idempotencyKey: string;
  } | null>(null);
  const emailVerification = usePendingEmailVerification();
  const ideaQuotaKind: "account" | "anonymous" =
    session.isAuthenticated === true &&
    (session.accountAttempts === null ||
      session.accountAttempts.ideasPlanActive)
      ? "account"
      : "anonymous";

  async function handleEvaluation(request: HomeEvaluationRequest) {
    if (isEvaluationSubmittingRef.current) return;
    isEvaluationSubmittingRef.current = true;
    if (await emailVerification.check()) {
      isEvaluationSubmittingRef.current = false;
      setIsEmailVerificationDialogOpen(true);
      return;
    }
    resetEvaluationState();
    setIsEvaluating(true);
    setIsEvaluationDialogOpen(true);
    const pendingSubmission = retryableSubmissionRef.current;
    const idempotencyKey =
      pendingSubmission &&
      hasSameEvaluationRequest(pendingSubmission.request, request)
        ? pendingSubmission.idempotencyKey
        : crypto.randomUUID();
    retryableSubmissionRef.current = { request, idempotencyKey };
    let processErrorType: typeof EvaluationProcessError | null = null;
    try {
      const { evaluationProcess, EvaluationProcessError } =
        await import("./evaluation-process");
      processErrorType = EvaluationProcessError;
      const result = await evaluationProcess(request, idempotencyKey);
      applySubmissionResult(result, request, idempotencyKey);
      retryableSubmissionRef.current = null;
    } catch (error: unknown) {
      handleEvaluationError(error, processErrorType);
    } finally {
      isEvaluationSubmittingRef.current = false;
      setIsEvaluating(false);
      await refreshUsage();
    }
  }

  async function handleContinueEvaluation() {
    if (!pendingEvaluation || isEvaluationSubmittingRef.current) return;
    isEvaluationSubmittingRef.current = true;
    if (await emailVerification.check()) {
      isEvaluationSubmittingRef.current = false;
      setIsEvaluationDialogOpen(false);
      setIsEmailVerificationDialogOpen(true);
      return;
    }
    setEvaluationError("");
    setIsEvaluating(true);
    setIsEvaluationDialogOpen(true);
    let processErrorType: typeof EvaluationProcessError | null = null;
    try {
      const { evaluationProcess, EvaluationProcessError } =
        await import("./evaluation-process");
      processErrorType = EvaluationProcessError;
      const result = await evaluationProcess(
        pendingEvaluation.request,
        pendingEvaluation.idempotencyKey,
        true,
      );
      applySubmissionResult(
        result,
        pendingEvaluation.request,
        pendingEvaluation.idempotencyKey,
      );
    } catch (error: unknown) {
      handleEvaluationError(error, processErrorType);
    } finally {
      isEvaluationSubmittingRef.current = false;
      setIsEvaluating(false);
      await refreshUsage();
    }
  }

  function handleEvaluationError(
    error: unknown,
    errorType: typeof EvaluationProcessError | null,
  ) {
    if (errorType && error instanceof errorType) {
      if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
        setIsEvaluationDialogOpen(false);
        setIsEmailVerificationDialogOpen(true);
        return;
      }
      if (error.code === "ANONYMOUS_QUOTA_EXHAUSTED") {
        setIsEvaluationDialogOpen(false);
        setIsQuotaDialogOpen(true);
        return;
      }
      if (error.code === "PLAN_QUOTA_EXHAUSTED") {
        setIsEvaluationDialogOpen(false);
        setIsDailyQuotaDialogOpen(true);
        return;
      }
      if (
        error.code === "ACTIVE_PLAN_REQUIRED" ||
        error.code === "EVALUATION_OUTCOME_UNKNOWN"
      ) {
        setEvaluationError(error.message);
        return;
      }
    }
    setEvaluationError(EVALUATION_FAILURE_MESSAGE);
  }

  async function refreshUsage() {
    const refreshResults = await Promise.all([
      anonymousUsage.refresh(),
      session.isAuthenticated === false
        ? Promise.resolve(null)
        : session.refresh(),
    ]);
    const attempts = refreshResults[1];
    if (attempts?.ideasPlanActive && attempts.ideas === 0) {
      setIsDailyQuotaDialogOpen(true);
    }
  }

  function resetEvaluationState() {
    setEvaluationResult(null);
    setSimilarIdeaMatch(null);
    setSpecialIdeaCase(null);
    setEvaluationError("");
  }

  function handleEvaluationDialogClose() {
    setIsEvaluationDialogOpen(false);
    setIdeaStepResetKey((currentKey) => currentKey + 1);
  }

  function applySubmissionResult(
    result: EvaluationSubmissionResult,
    request: HomeEvaluationRequest,
    idempotencyKey: string,
  ) {
    if (result.status === "special_case") {
      setEvaluationResult(null);
      setSimilarIdeaMatch(null);
      setSpecialIdeaCase(result);
      setPendingEvaluation(null);
      return;
    }
    if (result.status === "similar_idea_match") {
      setEvaluationResult(null);
      setSpecialIdeaCase(null);
      setSimilarIdeaMatch(result);
      setPendingEvaluation({ request, idempotencyKey });
      return;
    }
    setSimilarIdeaMatch(null);
    setSpecialIdeaCase(null);
    setPendingEvaluation(null);
    setEvaluationResult(result);
  }

  return {
    isEvaluating,
    evaluationResult,
    similarIdeaMatch,
    specialIdeaCase,
    pendingEvaluation,
    evaluationError,
    isEvaluationDialogOpen,
    ideaStepResetKey,
    isQuotaDialogOpen,
    isDailyQuotaDialogOpen,
    isEmailVerificationDialogOpen,
    ideaQuotaKind,
    handleEvaluation,
    handleContinueEvaluation,
    handleEvaluationDialogClose,
    onQuotaDialogClose: () => setIsQuotaDialogOpen(false),
    onDailyQuotaDialogClose: () => setIsDailyQuotaDialogOpen(false),
    onEmailVerificationDialogClose: () =>
      setIsEmailVerificationDialogOpen(false),
    onQuotaExhausted: () => setIsQuotaDialogOpen(true),
    reopenEvaluationDialog: () => setIsEvaluationDialogOpen(true),
  };
}

function hasSameEvaluationRequest(
  first: HomeEvaluationRequest,
  second: HomeEvaluationRequest,
): boolean {
  return first.ideaText === second.ideaText && first.tone === second.tone;
}
