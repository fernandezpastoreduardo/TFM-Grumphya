import { GetUserIdea } from "../../get-user-idea/get-user-idea";
import { useAnonymousUsage } from "../../../shared/hooks/use-anonymous-usage";
import { useSessionStatus } from "../../../infrastructure/auth/use-session-status";
import type { HomeEvaluationRequest } from "../idea-evaluation.models";
import { getIdeaAttemptsRemaining } from "../idea-evaluation.utils";

type EvaluationWorkspaceProps = {
  session: ReturnType<typeof useSessionStatus>;
  anonymousUsage: ReturnType<typeof useAnonymousUsage>;
  quotaKind: "account" | "anonymous";
  isSubmitting: boolean;
  stepResetKey: number;
  onSubmit: (request: HomeEvaluationRequest) => void;
  onQuotaExhausted: () => void;
};

export function EvaluationWorkspace({
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
