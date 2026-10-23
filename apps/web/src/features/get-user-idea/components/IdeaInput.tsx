import type { RefObject } from "react";
import { MAX_IDEA_LENGTH } from "../idea-input-rules";
import { TranscriptUserIdea } from "../../transcript-user-idea/transcript-user-idea";
import { isSpeechToTextSupported } from "../../../shared/utils/speech-to-text";

type IdeaInputProps = {
  value: string;
  onChange: (value: string) => void;
  onDictatedText: (transcript: string) => void;
  errorMessage?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

const IDEA_INPUT_LABELS = {
  WITH_DICTATION: "1. Escribe, pega o dicta tu idea",
  WITHOUT_DICTATION: "1. Escribe o pega tu idea",
} as const;
const CLEAR_IDEA_LABEL = "Borrar idea";
const IDEA_INPUT_HELP =
  "Quién la usaría, qué le duele y qué haría la app. Lo básico, vamos.";
const INPUT_ID = "idea-text";
const HELP_ID = "idea-text-help";
const ERROR_ID = "idea-text-error";

export function IdeaInput({
  value,
  onChange,
  onDictatedText,
  errorMessage,
  textareaRef,
}: IdeaInputProps) {
  const ideaInputLabel = isSpeechToTextSupported()
    ? IDEA_INPUT_LABELS.WITH_DICTATION
    : IDEA_INPUT_LABELS.WITHOUT_DICTATION;
  const describedBy = errorMessage ? `${HELP_ID} ${ERROR_ID}` : HELP_ID;

  return (
    <div className="idea-input-field">
      <label className="idea-input-label" htmlFor={INPUT_ID}>
        {ideaInputLabel}
      </label>
      <div className="idea-input-area">
        <textarea
          id={INPUT_ID}
          ref={textareaRef}
          name="ideaText"
          className="idea-input-textarea"
          rows={5}
          maxLength={MAX_IDEA_LENGTH}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Pega aquí tu idea. Vamos a ver qué agujeros trae."
          aria-describedby={describedBy}
          aria-invalid={Boolean(errorMessage)}
        />
        <div className="idea-input-tools">
          <TranscriptUserIdea onTranscript={onDictatedText} />
          {value ? (
            <button
              className="idea-clear-button"
              type="button"
              aria-label={CLEAR_IDEA_LABEL}
              onClick={() => onChange("")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="idea-input-meta">
          <span className="sr-only" id={HELP_ID}>
            {IDEA_INPUT_HELP}
          </span>
          <span aria-live="polite">
            {value.length}/{MAX_IDEA_LENGTH}
          </span>
        </div>
      </div>
      {errorMessage ? (
        <p className="idea-input-error" id={ERROR_ID} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
