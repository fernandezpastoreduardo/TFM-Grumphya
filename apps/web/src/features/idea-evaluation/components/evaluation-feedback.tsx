import { EvaluationDialog } from "./EvaluationDialog";
import { EvaluationFailureNotice } from "./EvaluationFailureNotice";
import { EvaluationResult } from "./EvaluationResult";
import { SpecialIdeaCaseNotice } from "./SpecialIdeaCaseNotice";
import { SimilarIdeaNotice } from "../../repeated-ideas/components/SimilarIdeaNotice";
import type {
  EvaluationProcessResult,
  SimilarIdeaMatchResult,
  SpecialIdeaCaseResult,
} from "../evaluation-process";
import type { HomeEvaluationRequest } from "../idea-evaluation.models";
import { hasEvaluationFeedback } from "../idea-evaluation.utils";

const EVALUATION_FAILURE_MESSAGE =
  "La evaluación se ha torcido. Ni Grumphya puede arreglarlo con café. No se te ha descontado este intento. Prueba otra vez en un rato.";

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

export function EvaluationFeedback({
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
