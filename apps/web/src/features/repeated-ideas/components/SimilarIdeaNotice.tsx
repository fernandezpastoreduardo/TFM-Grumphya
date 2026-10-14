import type { SimilarIdeaMatchResult } from "../../idea-evaluation/evaluation-process";

type SimilarIdeaNoticeProps = {
  match: SimilarIdeaMatchResult;
  tone: "soft" | "hard";
  isSubmitting: boolean;
  onContinue: () => void;
};

const CONTINUE_LABEL = {
  IDLE: "Evaluar igualmente",
  LOADING: "Preparando evaluación…",
} as const;

const TONE_MESSAGE = {
  soft: "Esta idea ya se rechazó antes. Puede que cambiar la forma de contarla no cambie el problema de fondo.",
  hard: "Esta idea ya se llevó un golpe y ha vuelto. La pregunta sigue siendo la misma: ¿quién la usaría?",
} as const;

export function SimilarIdeaNotice({
  match,
  tone,
  isSubmitting,
  onContinue,
}: SimilarIdeaNoticeProps) {
  return (
    <div className="similar-idea-notice" role="status">
      <h2>Esta idea ya nos suena</h2>
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
