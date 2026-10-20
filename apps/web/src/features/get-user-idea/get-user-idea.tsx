import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import "./get-user-idea.scss";
import { IdeaInput } from "./components/IdeaInput";
import { MAX_IDEA_LENGTH } from "./idea-input-rules";
import type {
  GetUserIdeaRequest,
  IdeaTone,
  InvalidIdeaTextReason,
} from "./models";
import { validateIdeaText } from "./validate-idea-text";

type GetUserIdeaProps = {
  onSubmit: (request: GetUserIdeaRequest) => void;
  onQuotaExhausted?: () => void;
  onIdeaChange?: (ideaText: string) => void;
  isSubmitting?: boolean;
  remainingAttempts?: number | null;
  quotaKind?: "anonymous" | "account";
  unlimitedAttempts?: boolean;
  error?: string;
};

const TONE_OPTIONS: { tone: IdeaTone; label: string; description: string }[] = [
  {
    tone: "soft",
    label: "Tengo la piel fina",
    description: "Con cuidado: también tengo sentimientos.",
  },
  {
    tone: "hard",
    label: "Dame tu mejor golpe",
    description: "Sin filtros. Dime la verdad, aunque duela.",
  },
];
const EMPTY_IDEA_MESSAGE =
  "Hay aire. Mucho aire. Escribe la idea y lo intentamos de nuevo.";
const SHORT_IDEA_MESSAGE =
  "Nueve caracteres: ni una idea ni un haiku. Añade al menos 10 caracteres.";
const LONG_IDEA_MESSAGE = `Son más de ${MAX_IDEA_LENGTH} caracteres y aún no aterriza. Recorta el rodeo.`;
const DICTATION_SEPARATOR = " ";
const INVALID_IDEA_MESSAGE =
  "Eso no parece texto utilizable. Prueba a escribirlo otra vez.";
const BUTTON_LABEL = {
  IDLE: "Evaluar idea",
  LOADING: "Evaluando…",
} as const;
const NEXT_STEP_LABEL = "Adelante";
const PREVIOUS_STEP_LABEL = "Cambiar idea";
const VALIDATION_MESSAGES: Record<InvalidIdeaTextReason, string> = {
  not_text: INVALID_IDEA_MESSAGE,
  empty: EMPTY_IDEA_MESSAGE,
  too_short: SHORT_IDEA_MESSAGE,
  too_long: LONG_IDEA_MESSAGE,
};

function getValidationMessage(reason: InvalidIdeaTextReason): string {
  return VALIDATION_MESSAGES[reason];
}

export function GetUserIdea({
  onSubmit,
  onQuotaExhausted,
  onIdeaChange,
  isSubmitting = false,
  remainingAttempts,
  quotaKind = "anonymous",
  unlimitedAttempts = false,
  error,
}: GetUserIdeaProps) {
  const [step, setStep] = useState<"idea" | "tone">("idea");
  const [ideaText, setIdeaText] = useState("");
  const [tone, setTone] = useState<IdeaTone>("soft");
  const [validationError, setValidationError] = useState("");
  const ideaInputRef = useRef<HTMLTextAreaElement>(null);
  const firstToneOptionRef = useRef<HTMLInputElement>(null);
  const previousStep = useRef<"idea" | "tone" | null>(null);

  useEffect(() => {
    if (previousStep.current === null) {
      previousStep.current = step;
      return;
    }
    if (previousStep.current === step) return;

    previousStep.current = step;
    if (step === "tone") firstToneOptionRef.current?.focus();
    else ideaInputRef.current?.focus();
  }, [step]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateIdeaText(ideaText);
    if (!validation.valid) {
      setValidationError(getValidationMessage(validation.reason));
      setStep("idea");
      return;
    }

    setValidationError("");
    if (
      quotaKind === "anonymous" &&
      remainingAttempts === 0 &&
      onQuotaExhausted
    ) {
      onQuotaExhausted();
      return;
    }
    onSubmit({ ideaText: validation.value, tone });
  }

  function handleContinue() {
    const validation = validateIdeaText(ideaText);
    if (!validation.valid) {
      setValidationError(getValidationMessage(validation.reason));
      ideaInputRef.current?.focus();
      return;
    }

    setValidationError("");
    setStep("tone");
  }

  function handleIdeaChange(value: string) {
    setIdeaText(value);
    onIdeaChange?.(value);
    if (validationError) setValidationError("");
  }

  function handleDictatedText(transcript: string) {
    const currentText = ideaText.trimEnd();
    const nextText = [currentText, transcript.trim()]
      .filter(Boolean)
      .join(DICTATION_SEPARATOR)
      .slice(0, MAX_IDEA_LENGTH);
    handleIdeaChange(nextText);
  }

  const currentError = validationError || error;

  return (
    <form className="idea-form" onSubmit={handleSubmit} noValidate>
      {step === "idea" ? (
        <>
          <IdeaInput
            value={ideaText}
            onChange={handleIdeaChange}
            onDictatedText={handleDictatedText}
            errorMessage={currentError}
            textareaRef={ideaInputRef}
          />
          <div className="idea-step-actions">
            <button
              className="idea-submit"
              type="button"
              onClick={handleContinue}
            >
              {NEXT_STEP_LABEL}
              <SubmitButtonDecoration />
            </button>
          </div>
        </>
      ) : (
        <>
          <fieldset className="idea-tone-options">
            <legend>2. Elige cómo quieres que te responda</legend>
            {TONE_OPTIONS.map((option, index) => (
              <label className="idea-tone-option" key={option.tone}>
                <input
                  type="radio"
                  name="tone"
                  value={option.tone}
                  checked={tone === option.tone}
                  onChange={() => setTone(option.tone)}
                  ref={index === 0 ? firstToneOptionRef : undefined}
                />
                <span
                  className={`idea-tone-illustration idea-tone-illustration-${option.tone}`}
                  aria-hidden="true"
                />
                <span className="idea-tone-copy">
                  <span className="idea-tone-label">{option.label}</span>
                  <span className="idea-tone-description">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className="idea-submit"
            type="submit"
            disabled={isSubmitting || remainingAttempts === null}
          >
            {isSubmitting ? BUTTON_LABEL.LOADING : BUTTON_LABEL.IDLE}
            <SubmitButtonDecoration />
          </button>
          <button
            className="idea-back-button"
            type="button"
            onClick={() => setStep("idea")}
          >
            {PREVIOUS_STEP_LABEL}
          </button>
        </>
      )}
      {remainingAttempts === null ? (
        <LoadingSkeleton
          label="Comprobando tus intentos disponibles"
          className="idea-attempts-skeleton"
        >
          <SkeletonBlock className="skeleton-idea-attempts" />
        </LoadingSkeleton>
      ) : remainingAttempts !== undefined ? (
        <p className="idea-privacy-note" aria-live="polite">
          {unlimitedAttempts
            ? "Tienes evaluaciones ilimitadas. Hasta Jappy necesita una ventaja."
            : getUsageMessage(remainingAttempts, quotaKind)}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButtonDecoration() {
  return (
    <>
      <svg
        className="submit-arrow"
        viewBox="0 0 28 18"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M2 9h21m-7-7 7 7-7 7" />
      </svg>
      <span
        className="submit-ray-cluster submit-ray-cluster-start"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </span>
      <span
        className="submit-ray-cluster submit-ray-cluster-end"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </span>
    </>
  );
}

function getUsageMessage(
  remainingAttempts: number,
  quotaKind: "anonymous" | "account",
): string {
  if (quotaKind === "account") {
    if (remainingAttempts === 0)
      return "Has agotado las 11 evaluaciones disponibles hoy en Iluminado.";
    return `Te quedan ${remainingAttempts} de 11 evaluaciones disponibles hoy en Iluminado.`;
  }
  if (remainingAttempts === 0)
    return "Has agotado tus tres evaluaciones gratuitas en este navegador. Consulta los planes para continuar.";
  return `Te quedan ${remainingAttempts} de 3 evaluaciones gratuitas en este navegador.`;
}
