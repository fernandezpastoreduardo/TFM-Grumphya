import type { ReactNode } from "react";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { EvaluationFeedback } from "./components/evaluation-feedback";
import { EvaluationQuotaDialogs } from "./components/evaluation-quota-dialogs";
import { EvaluationWorkspace } from "./components/evaluation-workspace";
import type { EvaluationSlots } from "./idea-evaluation.models";
import { useIdeaEvaluation } from "./use-idea-evaluation";

type IdeaEvaluationProps = {
  session: ReturnType<typeof useSessionStatus>;
  anonymousUsage: ReturnType<typeof useAnonymousUsage>;
  children: (slots: EvaluationSlots) => ReactNode;
};

export function IdeaEvaluation({
  session,
  anonymousUsage,
  children,
}: IdeaEvaluationProps) {
  const evaluation = useIdeaEvaluation(session, anonymousUsage);

  return children({
    workspace: (
      <EvaluationWorkspace
        session={session}
        anonymousUsage={anonymousUsage}
        quotaKind={evaluation.ideaQuotaKind}
        isSubmitting={evaluation.isEvaluating}
        stepResetKey={evaluation.ideaStepResetKey}
        onSubmit={evaluation.handleEvaluation}
        onQuotaExhausted={evaluation.onQuotaExhausted}
      />
    ),
    feedback: (
      <>
        <EvaluationFeedback
          isEvaluating={evaluation.isEvaluating}
          evaluationError={evaluation.evaluationError}
          evaluationResult={evaluation.evaluationResult}
          similarIdeaMatch={evaluation.similarIdeaMatch}
          specialIdeaCase={evaluation.specialIdeaCase}
          pendingEvaluation={evaluation.pendingEvaluation}
          isDialogOpen={evaluation.isEvaluationDialogOpen}
          onReopen={evaluation.reopenEvaluationDialog}
          onClose={evaluation.handleEvaluationDialogClose}
          onContinue={evaluation.handleContinueEvaluation}
        />
        <EvaluationQuotaDialogs
          isQuotaDialogOpen={evaluation.isQuotaDialogOpen}
          isDailyQuotaDialogOpen={evaluation.isDailyQuotaDialogOpen}
          isEmailVerificationDialogOpen={
            evaluation.isEmailVerificationDialogOpen
          }
          onQuotaDialogClose={evaluation.onQuotaDialogClose}
          onDailyQuotaDialogClose={evaluation.onDailyQuotaDialogClose}
          onEmailVerificationDialogClose={
            evaluation.onEmailVerificationDialogClose
          }
        />
      </>
    ),
  });
}
