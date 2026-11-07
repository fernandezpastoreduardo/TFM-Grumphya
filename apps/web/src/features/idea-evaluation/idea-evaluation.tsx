import { useEffect, useRef, useState, type ReactNode } from "react";
import { GetUserIdea } from "../get-user-idea/get-user-idea";
import { EvaluationDialog } from "./components/EvaluationDialog";
import { EvaluationFailureNotice } from "./components/EvaluationFailureNotice";
import { EvaluationResult } from "./components/EvaluationResult";
import { SpecialIdeaCaseNotice } from "./components/SpecialIdeaCaseNotice";
import { SimilarIdeaNotice } from "../repeated-ideas/components/SimilarIdeaNotice";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { UsageLimitDialog } from "../../shared/components/usage-limit-dialog";
import { EmailVerificationRequiredDialog } from "../../shared/components/email-verification-required-dialog";
import { usePendingEmailVerification } from "../../shared/hooks/use-pending-email-verification";
import {
  evaluationProcess,
  EvaluationProcessError,
  type EvaluationSubmissionResult,
  type SimilarIdeaMatchResult,
  type EvaluationProcessResult,
  type SpecialIdeaCaseResult,
} from "./evaluation-process";

const EVALUATION_FAILURE_MESSAGE =
  "La evaluación se ha torcido. Ni Grumphya puede arreglarlo con café. No se te ha descontado este intento. Prueba otra vez en un rato.";
type HomeEvaluationRequest = {
  ideaText: string;
  tone: "soft" | "hard";
};
type EvaluationSlots = { workspace: ReactNode; feedback: ReactNode };
type IdeaEvaluationProps = {
  session: ReturnType<typeof useSessionStatus>;
  anonymousUsage: ReturnType<typeof useAnonymousUsage>;
  children: (slots: EvaluationSlots) => ReactNode;
};

function getIdeaAttemptsRemaining(
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

export function IdeaEvaluation({
  session,
  anonymousUsage,
  children,
}: IdeaEvaluationProps) {
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
  const ideaQuotaKind =
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
    setEvaluationResult(null);
    setSimilarIdeaMatch(null);
    setSpecialIdeaCase(null);
    setEvaluationError("");
    setIsEvaluating(true);
    setIsEvaluationDialogOpen(true);
    const pendingSubmission = retryableSubmissionRef.current;
    const idempotencyKey =
      pendingSubmission &&
      hasSameEvaluationRequest(pendingSubmission.request, request)
        ? pendingSubmission.idempotencyKey
        : crypto.randomUUID();
    retryableSubmissionRef.current = { request, idempotencyKey };
    try {
      const result = await evaluationProcess(request, idempotencyKey);
      applySubmissionResult(result, request, idempotencyKey);
      retryableSubmissionRef.current = null;
    } catch (error: unknown) {
      handleEvaluationError(error);
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
    try {
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
      handleEvaluationError(error);
    } finally {
      isEvaluationSubmittingRef.current = false;
      setIsEvaluating(false);
      await refreshUsage();
    }
  }

  function handleEvaluationError(error: unknown) {
    if (error instanceof EvaluationProcessError) {
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
      if (error.code === "ACTIVE_PLAN_REQUIRED") {
        setEvaluationError(error.message);
        return;
      }
      if (error.code === "EVALUATION_OUTCOME_UNKNOWN") {
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

  return children({
    workspace: (
      <EvaluationWorkspace
        session={session}
        anonymousUsage={anonymousUsage}
        quotaKind={ideaQuotaKind}
        isSubmitting={isEvaluating}
        stepResetKey={ideaStepResetKey}
        onSubmit={handleEvaluation}
        onQuotaExhausted={() => setIsQuotaDialogOpen(true)}
      />
    ),
    feedback: (
      <>
        <EvaluationFeedback
          isEvaluating={isEvaluating}
          evaluationError={evaluationError}
          evaluationResult={evaluationResult}
          similarIdeaMatch={similarIdeaMatch}
          specialIdeaCase={specialIdeaCase}
          pendingEvaluation={pendingEvaluation}
          isDialogOpen={isEvaluationDialogOpen}
          onReopen={() => setIsEvaluationDialogOpen(true)}
          onClose={handleEvaluationDialogClose}
          onContinue={handleContinueEvaluation}
        />
        <EvaluationQuotaDialogs
          isQuotaDialogOpen={isQuotaDialogOpen}
          isDailyQuotaDialogOpen={isDailyQuotaDialogOpen}
          isEmailVerificationDialogOpen={isEmailVerificationDialogOpen}
          onQuotaDialogClose={() => setIsQuotaDialogOpen(false)}
          onDailyQuotaDialogClose={() => setIsDailyQuotaDialogOpen(false)}
          onEmailVerificationDialogClose={() =>
            setIsEmailVerificationDialogOpen(false)
          }
        />
      </>
    ),
  });
}

type EvaluationWorkspaceProps = {
  session: ReturnType<typeof useSessionStatus>;
  anonymousUsage: ReturnType<typeof useAnonymousUsage>;
  quotaKind: "account" | "anonymous";
  isSubmitting: boolean;
  stepResetKey: number;
  onSubmit: (request: HomeEvaluationRequest) => void;
  onQuotaExhausted: () => void;
};

function EvaluationWorkspace({
  session,
  anonymousUsage,
  quotaKind,
  isSubmitting,
  stepResetKey,
  onSubmit,
  onQuotaExhausted,
}: EvaluationWorkspaceProps) {
  return (
    <section className="home-workspace" aria-label="Preparar una idea">
      <GetUserIdea
        onSubmit={(request) => onSubmit(request)}
        stepResetKey={stepResetKey}
        onQuotaExhausted={
          quotaKind === "anonymous" ? onQuotaExhausted : undefined
        }
        isSubmitting={isSubmitting}
        remainingAttempts={getIdeaAttemptsRemaining(
          session.isAuthenticated,
          anonymousUsage.usage?.ideas.remaining,
          session.accountAttempts?.ideas,
          session.accountAttempts?.ideasPlanActive ?? null,
        )}
        quotaKind={quotaKind}
        unlimitedAttempts={session.accountAttempts?.isAdmin === true}
      />
      {anonymousUsage.error ? (
        <p className="home-result-error" role="alert">
          {anonymousUsage.error}
        </p>
      ) : null}
      <p className="home-manifesto">
        Porque poder hacerlo no significa que debas hacerlo.
      </p>
    </section>
  );
}

type EvaluationFeedbackProps = {
  isEvaluating: boolean;
  evaluationError: string;
  evaluationResult: EvaluationProcessResult | null;
  similarIdeaMatch: SimilarIdeaMatchResult | null;
  specialIdeaCase: SpecialIdeaCaseResult | null;
  pendingEvaluation: {
    request: HomeEvaluationRequest;
    idempotencyKey: string;
  } | null;
  isDialogOpen: boolean;
  onReopen: () => void;
  onClose: () => void;
  onContinue: () => void;
};

function EvaluationFeedback({
  isEvaluating,
  evaluationError,
  evaluationResult,
  similarIdeaMatch,
  specialIdeaCase,
  pendingEvaluation,
  isDialogOpen,
  onReopen,
  onClose,
  onContinue,
}: EvaluationFeedbackProps) {
  return (
    <>
      <section className="home-result" aria-label="Resultado de la evaluación">
        {!isDialogOpen &&
        hasEvaluationFeedback(
          isEvaluating,
          evaluationError,
          evaluationResult,
          similarIdeaMatch,
          specialIdeaCase,
        ) ? (
          <button
            className="evaluation-reopen-button"
            type="button"
            onClick={onReopen}
          >
            {isEvaluating
              ? "Volver a la evaluación en curso"
              : "Volver a ver la evaluación"}
          </button>
        ) : null}
      </section>
      <EvaluationDialog
        open={isDialogOpen}
        isEvaluating={isEvaluating}
        onClose={onClose}
      >
        {!isEvaluating && evaluationError ? (
          <EvaluationErrorContent message={evaluationError} />
        ) : null}
        {!isEvaluating && evaluationResult ? (
          <EvaluationResult result={evaluationResult} />
        ) : null}
        {!isEvaluating && specialIdeaCase ? (
          <SpecialIdeaCaseNotice result={specialIdeaCase} />
        ) : null}
        {!isEvaluating && similarIdeaMatch ? (
          <SimilarIdeaNotice
            match={similarIdeaMatch}
            tone={pendingEvaluation?.request.tone ?? "soft"}
            isSubmitting={isEvaluating}
            onContinue={() => void onContinue()}
          />
        ) : null}
      </EvaluationDialog>
    </>
  );
}

function hasEvaluationFeedback(
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

function EvaluationErrorContent({ message }: { message: string }) {
  if (message === EVALUATION_FAILURE_MESSAGE) {
    return <EvaluationFailureNotice message={message} />;
  }
  return (
    <p className="home-result-error" role="alert">
      {message}
    </p>
  );
}

type EvaluationQuotaDialogsProps = {
  isQuotaDialogOpen: boolean;
  isDailyQuotaDialogOpen: boolean;
  isEmailVerificationDialogOpen: boolean;
  onQuotaDialogClose: () => void;
  onDailyQuotaDialogClose: () => void;
  onEmailVerificationDialogClose: () => void;
};

function EvaluationQuotaDialogs({
  isQuotaDialogOpen,
  isDailyQuotaDialogOpen,
  isEmailVerificationDialogOpen,
  onQuotaDialogClose,
  onDailyQuotaDialogClose,
  onEmailVerificationDialogClose,
}: EvaluationQuotaDialogsProps) {
  const quotaDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = quotaDialogRef.current;
    if (!dialog) return;
    if (isQuotaDialogOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!isQuotaDialogOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isQuotaDialogOpen]);

  return (
    <>
      <EmailVerificationRequiredDialog
        open={isEmailVerificationDialogOpen}
        onClose={onEmailVerificationDialogClose}
      />
      {isQuotaDialogOpen ? (
        <dialog
          ref={quotaDialogRef}
          className="quota-exhausted-dialog"
          aria-labelledby="quota-exhausted-title"
          aria-describedby="quota-exhausted-copy"
          onClose={onQuotaDialogClose}
        >
          <button
            className="quota-dialog-close"
            type="button"
            aria-label="Cerrar aviso de usos gratuitos agotados"
            onClick={onQuotaDialogClose}
          >
            ×
          </button>
          <img
            src="/assets/grumphya/mascot-crossed-arms.webp"
            alt="Grumphya esperando un café"
          />
          <span className="eyebrow">El café se ha terminado</span>
          <h2 id="quota-exhausted-title">Ya conoces el método</h2>
          <p id="quota-exhausted-copy">
            Ahora que sabes cómo va la app, te cuento el detalle: funciono a
            base de café. Tus tres pruebas gratis ya se han agotado. No se
            reinician: cada navegador tiene tres evaluaciones de por vida.
          </p>
          <a className="button-primary" href="/precios">
            A ver lo que cuesta un café <span aria-hidden="true">↗</span>
          </a>
        </dialog>
      ) : null}
      {isDailyQuotaDialogOpen ? (
        <UsageLimitDialog
          open
          scope="ideas"
          onClose={onDailyQuotaDialogClose}
        />
      ) : null}
    </>
  );
}

function hasSameEvaluationRequest(
  first: HomeEvaluationRequest,
  second: HomeEvaluationRequest,
): boolean {
  return first.ideaText === second.ideaText && first.tone === second.tone;
}
