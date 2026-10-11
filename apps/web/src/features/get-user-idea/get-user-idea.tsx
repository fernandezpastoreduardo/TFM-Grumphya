import { useState, type FormEvent } from "react";
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
  onIdeaChange?: (ideaText: string) => void;
  isSubmitting?: boolean;
  error?: string;
};

const TONE_OPTIONS: { tone: IdeaTone; label: string; description: string }[] = [
  {
    tone: "soft",
    label: "Dime qué opinas",
    description: "Directa, sin ensañarse.",
  },
  {
    tone: "hard",
    label: "Dame tu mejor golpe",
    description: "Sarcasmo afilado. Sin anestesia.",
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
  IDLE: "A ver qué tienes",
  LOADING: "Preparando…",
} as const;
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
  onIdeaChange,
  isSubmitting = false,
  error,
}: GetUserIdeaProps) {
  const [ideaText, setIdeaText] = useState("");
  const [tone, setTone] = useState<IdeaTone>("soft");
  const [validationError, setValidationError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateIdeaText(ideaText);
    if (!validation.valid) {
      setValidationError(getValidationMessage(validation.reason));
      return;
    }

    setValidationError("");
    onSubmit({ ideaText: validation.value, tone });
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
      <IdeaInput
        value={ideaText}
        onChange={handleIdeaChange}
        onDictatedText={handleDictatedText}
        errorMessage={currentError}
      />
      <fieldset className="idea-tone-options">
        <legend>Elige cómo quieres que te responda</legend>
        {TONE_OPTIONS.map((option) => (
          <label className="idea-tone-option" key={option.tone}>
            <input
              type="radio"
              name="tone"
              value={option.tone}
              checked={tone === option.tone}
              onChange={() => setTone(option.tone)}
            />
            <span className="idea-tone-icon" aria-hidden="true">
              {option.tone === "soft" ? "✌️" : "😤"}
            </span>
            <span className="idea-tone-copy">
              <span className="idea-tone-label">{option.label}</span>
              <span className="idea-tone-description">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <button className="idea-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? BUTTON_LABEL.LOADING : BUTTON_LABEL.IDLE}
        <span aria-hidden="true">↗</span>
      </button>
      <p className="idea-privacy-note">
        La idea se envía al backend para un scoring simulado; no se persiste. El
        dictado usa el servicio de voz de tu navegador: revisa la transcripción
        antes de enviar.
      </p>
    </form>
  );
}
