import type { SimilarIdeaMatchResult } from "../../idea-evaluation/evaluation-process";
import "../repeated-ideas.scss";
import { CONTINUE_LABEL, TONE_MESSAGE } from "./SimilarIdeaNotice.constants";

type SimilarIdeaNoticeProps = {
  match: SimilarIdeaMatchResult;
  tone: "soft" | "hard";
  isSubmitting: boolean;
  onContinue: () => void;
};

export function SimilarIdeaNotice({
  match,
  tone,
  isSubmitting,
  onContinue,
}: SimilarIdeaNoticeProps) {
  return (
    <div className="similar-idea-notice" role="status">
      <h2>{match.headline}</h2>
      <p>
        Se parece a «{match.safeTitle}», una idea rechazada que se ha enviado{" "}
        {match.submissionCount} {match.submissionCount === 1 ? "vez" : "veces"}.
      </p>
      <p>{TONE_MESSAGE[tone]}</p>
      <p>Si continúas, enviaremos esta idea a una nueva evaluación.</p>
      <button
        className="similar-idea-continue"
        type="button"
        disabled={isSubmitting}
        onClick={onContinue}
      >
        {isSubmitting ? CONTINUE_LABEL.LOADING : CONTINUE_LABEL.IDLE}
      </button>
    </div>
  );
}
